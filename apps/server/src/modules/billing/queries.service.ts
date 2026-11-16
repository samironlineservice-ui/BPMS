import { Injectable } from '@nestjs/common';
import type {
  AllocationDto, ClientBalance, InvoiceDetail, InvoiceListItem, Paginated, PaymentDetail, PaymentListItem, SubscriptionDetail, SubscriptionListItem,
} from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { Db } from '../../platform/db.service.js';
import { notFound } from '../../platform/errors.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { dbDate, diffDays, fromDbDate, todayLocal } from '../../platform/time.js';
import { ApprovalsService } from '../approvals/approvals.service.js';

const clientRef = (c: { id: string; code: string; displayName: string }) => ({ id: c.id, code: c.code, name: c.displayName });
const s = (x: bigint | null | undefined) => (x === null || x === undefined ? null : x.toString());

const subInclude = {
  client: { select: { id: true, code: true, displayName: true } },
  clientProject: { select: { project: { select: { id: true, code: true, name: true } } } },
  revisions: { where: { validTo: null }, select: { mrrMinor: true }, take: 1 },
} satisfies Prisma.SubscriptionInclude;
type SubRow = Prisma.SubscriptionGetPayload<{ include: typeof subInclude }>;

const invInclude = { client: { select: { id: true, code: true, displayName: true } }, subscription: { select: { code: true } } } satisfies Prisma.InvoiceInclude;
type InvRow = Prisma.InvoiceGetPayload<{ include: typeof invInclude }>;

const payInclude = {
  client: { select: { id: true, code: true, displayName: true } }, createdBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude;
type PayRow = Prisma.PaymentGetPayload<{ include: typeof payInclude }>;

export interface InvoiceQuery { page: number; pageSize: number; q?: string; status?: string; clientId?: string; subscriptionId?: string; currency?: string; overdue?: boolean; kind?: string }
export interface PaymentQuery { page: number; pageSize: number; q?: string; status?: string; clientId?: string; method?: string; currency?: string }
export interface SubscriptionQuery { page: number; pageSize: number; q?: string; status?: string; clientId?: string; projectId?: string }

@Injectable()
export class BillingQueries {
  constructor(private readonly db: Db, private readonly approvals: ApprovalsService) {}

  private subItem(r: SubRow): SubscriptionListItem {
    return {
      id: r.id, code: r.code, client: clientRef(r.client), project: r.clientProject.project, status: r.status, currency: r.currency,
      mrrMinor: (r.revisions[0]?.mrrMinor ?? 0n).toString(), nextBillingOn: fromDbDate(r.nextBillingOn), currentPeriodStart: fromDbDate(r.currentPeriodStart),
      currentPeriodEnd: fromDbDate(r.currentPeriodEnd), cancelAtPeriodEnd: r.cancelAtPeriodEnd, createdAt: r.createdAt.toISOString(),
    };
  }

  invItem(r: InvRow, today = todayLocal()): InvoiceListItem {
    const outstanding = r.status === 'VOID' || r.status === 'DRAFT' ? 0n : r.totalMinor - r.paidMinor - r.creditedMinor;
    const due = fromDbDate(r.dueDate);
    return {
      id: r.id, number: r.number, kind: r.kind, status: r.status, client: clientRef(r.client), currency: r.currency, totalMinor: r.totalMinor.toString(),
      paidMinor: r.paidMinor.toString(), creditedMinor: r.creditedMinor.toString(), outstandingMinor: outstanding.toString(), issueDate: fromDbDate(r.issueDate),
      dueDate: due, periodStart: fromDbDate(r.periodStart), periodEnd: fromDbDate(r.periodEnd), subscriptionCode: r.subscription?.code ?? null,
      overdueDays: outstanding > 0n && due && due < today ? diffDays(due, today) : 0,
    };
  }

  private payItem(r: PayRow): PaymentListItem {
    return {
      id: r.id, code: r.code, client: clientRef(r.client), method: r.method, status: r.status, currency: r.currency, amountMinor: r.amountMinor.toString(),
      allocatedMinor: r.allocatedMinor.toString(), refundedMinor: r.refundedMinor.toString(),
      unallocatedMinor: (r.status === 'POSTED' ? r.amountMinor - r.allocatedMinor - r.refundedMinor : 0n).toString(),
      receivedAt: r.receivedAt.toISOString(), externalRef: r.externalRef, createdBy: r.createdBy?.fullName ?? null, approvedBy: r.approvedBy?.fullName ?? null,
    };
  }

  async subscriptions(q: SubscriptionQuery): Promise<Paginated<SubscriptionListItem>> {
    const term = q.q?.trim();
    const where: Prisma.SubscriptionWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.projectId ? { clientProject: { projectId: q.projectId } } : {}),
      ...(term ? { OR: [{ code: { contains: term, mode: 'insensitive' } }, { client: { displayName: { contains: term, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.subscription.findMany({ where, include: subInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.db.subscription.count({ where }),
    ]);
    return paged(rows.map((r) => this.subItem(r)), total, q);
  }

  async subscription(id: string): Promise<SubscriptionDetail> {
    const r = await this.db.subscription.findUnique({ where: { id }, include: subInclude });
    if (!r) throw notFound('Obuna');
    const [revisions, invoices] = await Promise.all([
      this.db.subscriptionRevision.findMany({
        where: { subscriptionId: id }, orderBy: { revisionNo: 'desc' }, include: { items: { include: { planPrice: { include: { plan: true } } } } },
      }),
      this.db.invoice.findMany({ where: { subscriptionId: id }, include: invInclude, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const today = todayLocal();
    return {
      ...this.subItem(r), clientProjectId: r.clientProjectId, trialEndsOn: fromDbDate(r.trialEndsOn), paymentTermsDays: r.paymentTermsDays, graceDays: r.graceDays,
      pastDueSince: fromDbDate(r.pastDueSince), endedAt: r.endedAt?.toISOString() ?? null, rowVersion: r.rowVersion,
      pendingChange: r.pendingChange,
      revisions: revisions.map((v) => ({
        id: v.id, revisionNo: v.revisionNo, validFrom: v.validFrom.toISOString(), validTo: v.validTo?.toISOString() ?? null, status: v.status,
        mrrMinor: v.mrrMinor.toString(), changeType: v.changeType, reason: v.reason,
        items: v.items.map((i) => ({
          planPriceId: i.planPriceId, planName: i.planPrice.plan.name, planCode: i.planPrice.plan.code, quantity: i.quantity,
          unitAmountMinor: i.unitAmountMinor.toString(), discountBp: i.discountBp, intervalMonths: i.planPrice.plan.intervalMonths,
        })),
      })),
      invoices: invoices.map((i) => this.invItem(i, today)),
    } as SubscriptionDetail;
  }

  async invoices(q: InvoiceQuery): Promise<Paginated<InvoiceListItem>> {
    const term = q.q?.trim();
    const today = todayLocal();
    const where: Prisma.InvoiceWhereInput = {
      ...(q.status ? { status: q.status as never } : { status: { not: 'DRAFT' } }),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.subscriptionId ? { subscriptionId: q.subscriptionId } : {}),
      ...(q.currency ? { currency: q.currency as never } : {}),
      ...(q.kind ? { kind: q.kind as never } : {}),
      ...(q.overdue ? { status: { in: ['OPEN', 'UNCOLLECTIBLE'] }, dueDate: { lt: dbDate(today) } } : {}),
      ...(term ? { OR: [{ number: { contains: term, mode: 'insensitive' } }, { client: { displayName: { contains: term, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.invoice.findMany({ where, include: invInclude, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], ...pageArgs(q) }),
      this.db.invoice.count({ where }),
    ]);
    return paged(rows.map((r) => this.invItem(r, today)), total, q);
  }

  private allocDto(a: Prisma.AllocationGetPayload<{ include: { payment: { select: { code: true } }; invoice: { select: { number: true } }; reversedBy: { select: { id: true } } } }>): AllocationDto {
    return {
      id: a.id, paymentId: a.paymentId, paymentCode: a.payment.code, invoiceId: a.invoiceId, invoiceNumber: a.invoice.number, paymentCurrency: a.paymentCurrency,
      invoiceCurrency: a.invoiceCurrency, amountPaymentMinor: a.amountPaymentMinor.toString(), amountInvoiceMinor: a.amountInvoiceMinor.toString(),
      fxRate: a.fxRate.toString(), fxDiffUzsMinor: a.fxDiffUzsMinor.toString(), appliedAt: a.appliedAt.toISOString(), reversalOfId: a.reversalOfId, reversed: !!a.reversedBy,
    };
  }

  async invoice(id: string): Promise<InvoiceDetail> {
    const r = await this.db.invoice.findUnique({
      where: { id },
      include: {
        ...invInclude, lines: { orderBy: { position: 'asc' } }, creditNotes: { orderBy: { issuedAt: 'asc' } },
        allocations: { include: { payment: { select: { code: true } }, invoice: { select: { number: true } }, reversedBy: { select: { id: true } } }, orderBy: { appliedAt: 'asc' } },
      },
    });
    if (!r) throw notFound('Invoice');
    return {
      ...this.invItem(r), subtotalMinor: r.subtotalMinor.toString(), vatMinor: r.vatMinor.toString(), fxRate: r.fxRate?.toString() ?? null,
      totalUzsMinor: s(r.totalUzsMinor), clientSnapshot: r.clientSnapshot as Record<string, unknown> | null, voidReason: r.voidReason,
      finalizedAt: r.finalizedAt?.toISOString() ?? null, voidedAt: r.voidedAt?.toISOString() ?? null, subscriptionId: r.subscriptionId, rowVersion: r.rowVersion,
      lines: r.lines.map((l) => ({
        id: l.id, position: l.position, type: l.type, description: l.description, quantity: l.quantity, unitAmountMinor: l.unitAmountMinor.toString(),
        prorationNum: l.prorationNum, prorationDen: l.prorationDen, amountMinor: l.amountMinor.toString(), vatRateBp: l.vatRateBp, vatMinor: l.vatMinor.toString(),
        periodStart: fromDbDate(l.periodStart), periodEnd: fromDbDate(l.periodEnd),
      })),
      allocations: r.allocations.map((a) => this.allocDto(a)),
      creditNotes: r.creditNotes.map((c) => ({ id: c.id, number: c.number, amountMinor: c.amountMinor.toString(), vatMinor: c.vatMinor.toString(), reason: c.reason, issuedAt: c.issuedAt.toISOString() })),
      approvals: await this.approvals.forResource(this.db, id),
    };
  }

  async payments(q: PaymentQuery): Promise<Paginated<PaymentListItem>> {
    const term = q.q?.trim();
    const where: Prisma.PaymentWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.method ? { method: q.method as never } : {}),
      ...(q.currency ? { currency: q.currency as never } : {}),
      ...(term ? { OR: [{ code: { contains: term, mode: 'insensitive' } }, { externalRef: { contains: term } }, { client: { displayName: { contains: term, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.payment.findMany({ where, include: payInclude, orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }], ...pageArgs(q) }),
      this.db.payment.count({ where }),
    ]);
    return paged(rows.map((r) => this.payItem(r)), total, q);
  }

  async payment(id: string): Promise<PaymentDetail> {
    const r = await this.db.payment.findUnique({
      where: { id },
      include: {
        ...payInclude,
        allocations: { include: { payment: { select: { code: true } }, invoice: { select: { number: true } }, reversedBy: { select: { id: true } } }, orderBy: { appliedAt: 'asc' } },
        refunds: { include: { requestedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw notFound("To'lov");
    return {
      ...this.payItem(r), fxRate: r.fxRate.toString(), amountUzsMinor: r.amountUzsMinor.toString(), notes: r.notes, receiptFileId: r.receiptFileId,
      allocations: r.allocations.map((a) => this.allocDto(a)),
      refunds: r.refunds.map((f) => ({
        id: f.id, amountMinor: f.amountMinor.toString(), status: f.status, reason: f.reason, requestedBy: f.requestedBy.fullName, approvedBy: f.approvedBy?.fullName ?? null,
        createdAt: f.createdAt.toISOString(), completedAt: f.completedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Mijoz balansi valyuta bo'yicha: qarz, muddati o'tgan qarz, taqsimlanmagan kredit. */
  async clientBalance(clientId: string): Promise<ClientBalance[]> {
    const today = dbDate(todayLocal());
    const rows = await this.db.$queryRaw<{ currency: string; receivable: bigint | null; overdue: bigint | null; credit: bigint | null; open: bigint | null }[]>`
      WITH inv AS (
        SELECT currency::text, sum(total_minor - paid_minor - credited_minor) AS receivable,
               sum(CASE WHEN due_date < ${today}::date THEN total_minor - paid_minor - credited_minor ELSE 0 END) AS overdue, count(*) AS open
          FROM invoices WHERE client_id = ${clientId}::uuid AND status IN ('OPEN','UNCOLLECTIBLE') GROUP BY currency),
      pay AS (
        SELECT currency::text, sum(amount_minor - allocated_minor - refunded_minor) AS credit
          FROM payments WHERE client_id = ${clientId}::uuid AND status = 'POSTED' GROUP BY currency)
      SELECT coalesce(inv.currency, pay.currency) AS currency, inv.receivable, inv.overdue, pay.credit, inv.open
        FROM inv FULL OUTER JOIN pay ON pay.currency = inv.currency`;
    return rows.map((r) => ({
      currency: r.currency, receivableMinor: String(r.receivable ?? 0), overdueMinor: String(r.overdue ?? 0), creditMinor: String(r.credit ?? 0), openInvoices: Number(r.open ?? 0),
    }));
  }
}
