import { Injectable } from '@nestjs/common';
import { convertMinor, mulDivRound, type OneTimeInvoiceInput, parseMoney } from '@ads/contracts';
import type { Currency, Invoice } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import { Db, type DbOrTx, type DbTx } from '../../platform/db.service.js';
import { badRequest, conflict, notFound } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { SequenceService } from '../../platform/sequence.service.js';
import { addDays, dayStart, daysInMonth, dbDate, diffDays, fromDbDate, todayLocal, yearOf } from '../../platform/time.js';
import { FxService } from '../finance/fx.service.js';
import { ACCOUNTS, LedgerService } from '../finance/ledger.service.js';
import { BILLABLE, itemLines, type ItemSpec, line, type LineDraft, periodBounds, periodLabel, sumLines } from './helpers.js';
import { LifecycleService, specsOf, type SubWithCp } from './lifecycle.service.js';

@Injectable()
export class InvoicingService {
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly seq: SequenceService,
    private readonly fx: FxService, private readonly ledger: LedgerService, private readonly lifecycle: LifecycleService,
  ) {}

  async lockInvoice(tx: DbTx, id: string) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
    const inv = await tx.invoice.findUnique({ where: { id }, include: { subscription: { include: { clientProject: { select: { projectId: true } } } } } });
    if (!inv) throw notFound('Invoice');
    return inv;
  }

  private async clientSnapshot(tx: DbOrTx, clientId: string) {
    const c = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
    return {
      code: c.code, type: c.type, legalName: c.legalName, displayName: c.displayName, tin: c.tin, vatPayer: c.vatPayer, legalAddress: c.legalAddress,
      bankName: c.bankName, bankMfo: c.bankMfo, bankAccount: c.bankAccount, phone: c.phone, billingEmail: c.billingEmail, accountNo: c.accountNo,
    };
  }

  async createDraft(tx: DbTx, p: {
    kind: 'RECURRING' | 'PRORATION' | 'ONE_TIME'; clientId: string; currency: Currency; subscriptionId?: string; revisionId?: string;
    billingRunId?: string; periodStart?: string; periodEnd?: string; lines: LineDraft[];
  }) {
    const inv = await tx.invoice.create({
      data: {
        kind: p.kind, clientId: p.clientId, currency: p.currency, subscriptionId: p.subscriptionId ?? null, revisionId: p.revisionId ?? null,
        billingRunId: p.billingRunId ?? null, periodStart: p.periodStart ? dbDate(p.periodStart) : null, periodEnd: p.periodEnd ? dbDate(p.periodEnd) : null,
      },
    });
    await tx.invoiceLine.createMany({
      data: p.lines.map((l, i) => ({
        invoiceId: inv.id, position: i + 1, type: l.type, description: l.description, planPriceId: l.planPriceId,
        periodStart: l.periodStart ? dbDate(l.periodStart) : null, periodEnd: l.periodEnd ? dbDate(l.periodEnd) : null, quantity: l.quantity,
        unitAmountMinor: l.unitAmountMinor, prorationNum: l.prorationNum, prorationDen: l.prorationDen, amountMinor: l.amountMinor,
        vatRateBp: l.vatRateBp, vatMinor: l.vatMinor, ikpuCode: l.ikpuCode, packageCode: l.packageCode,
      })),
    });
    return inv;
  }

  /** DRAFT → OPEN (yoki 0 summada PAID): gapless raqam, kurs, snapshot, ledger, outbox — bitta tranzaksiyada. */
  async finalize(tx: DbTx, invoiceId: string, issueDate: string, termsDays: number, projectId: string | null): Promise<Invoice> {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
    if (inv.status !== 'DRAFT') return inv;
    const subtotal = inv.lines.reduce((s, l) => s + l.amountMinor, 0n);
    const vat = inv.lines.reduce((s, l) => s + l.vatMinor, 0n);
    const total = subtotal + vat;
    if (total < 0n) throw badRequest('Invoice summasi manfiy bo\'lishi mumkin emas');
    const rate = inv.currency === 'USD' ? await this.fx.requireRate(issueDate, tx) : null;
    const totalUzs = rate ? convertMinor(total, rate.scaled) : total;
    const number = await this.seq.code(tx, 'INV', { year: yearOf(issueDate) });
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        number, status: total === 0n ? 'PAID' : 'OPEN', issueDate: dbDate(issueDate), dueDate: dbDate(addDays(issueDate, termsDays)),
        subtotalMinor: subtotal, vatMinor: vat, totalMinor: total, fxRateId: rate?.id ?? null, fxRate: rate?.str ?? null, totalUzsMinor: totalUzs,
        clientSnapshot: await this.clientSnapshot(tx, inv.clientId), finalizedAt: new Date(), rowVersion: { increment: 1 },
      },
    });
    if (total > 0n) {
      const revUzs = rate ? convertMinor(subtotal, rate.scaled) : subtotal;
      await this.ledger.post(tx, {
        key: `invoice:${invoiceId}:finalize`, date: issueDate, sourceType: 'invoice', sourceId: invoiceId, description: number,
        lines: [
          { account: ACCOUNTS.AR, currency: inv.currency, amountMinor: total, amountUzsMinor: totalUzs, clientId: inv.clientId },
          { account: ACCOUNTS.REVENUE, currency: inv.currency, amountMinor: -subtotal, amountUzsMinor: -revUzs, clientId: inv.clientId, projectId },
          { account: ACCOUNTS.VAT, currency: inv.currency, amountMinor: -vat, amountUzsMinor: -(totalUzs - revUzs), clientId: inv.clientId },
        ],
      });
    }
    await this.audit.record(tx, { action: 'invoice.finalized', resourceType: 'invoice', resourceId: invoiceId, metadata: { number, total: total.toString(), currency: inv.currency } });
    await this.outbox.add(tx, {
      type: 'invoice.finalized', eventKey: `invoice.finalized:${invoiceId}`, aggregateType: 'invoice', aggregateId: invoiceId,
      payload: { number, clientId: inv.clientId, totalMinor: total.toString(), currency: inv.currency },
    });
    return updated;
  }

  /** Obunaning navbatdagi davr(lar)ini hisoblaydi (bitta chaqiruvda ko'pi bilan 3 davr — catch-up). */
  async billSubscription(id: string, today = todayLocal(), billingRunId?: string) {
    const invoices: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await this.db.$transaction((tx) => this.billOnce(tx, id, today, billingRunId), { timeout: 30_000 });
      if (!r) break;
      if (r.invoiceId) invoices.push(r.invoiceId);
      if (r.stop) break;
    }
    return { invoices };
  }

  private async billOnce(tx: DbTx, id: string, today: string, billingRunId?: string): Promise<{ invoiceId?: string; stop?: boolean } | null> {
    let sub = await this.lifecycle.lock(tx, id);
    if (!(BILLABLE as readonly string[]).includes(sub.status) || !sub.nextBillingOn) return null;
    const P = fromDbDate(sub.nextBillingOn)!;
    if (P > today) return null;

    if (sub.status === 'TRIALING') {
      const trialEnd = fromDbDate(sub.trialEndsOn)!;
      if (trialEnd > today) return null;
      if (sub.cancelAtPeriodEnd) {
        await this.lifecycle.transition(tx, sub, 'CANCELLED', { at: dayStart(trialEnd), reason: 'Sinov muddati tugadi, obuna bekor qilingan edi' });
        return { stop: true };
      }
      sub = await this.lifecycle.transition(tx, sub, 'ACTIVE', { at: dayStart(trialEnd), reason: 'Sinov muddati tugadi' });
    }
    if (sub.cancelAtPeriodEnd) {
      await this.lifecycle.transition(tx, sub, 'CANCELLED', { at: dayStart(P), reason: 'Davr oxirida bekor qilindi' });
      return { stop: true };
    }
    if (await this.lifecycle.applyPendingChange(tx, sub, P)) sub = await this.lifecycle.lock(tx, id);

    const at = dayStart(P);
    const rev = (await this.lifecycle.revisionAt(tx, id, at)) ?? (await this.lifecycle.openRevision(tx, id));
    if (!rev || !rev.items.length) throw conflict(`${sub.code}: obuna tarkibi topilmadi`);
    const items = specsOf(rev);
    const { end, num, den, partial } = periodBounds(P, items[0]!.intervalMonths);
    const existing = await tx.invoice.findFirst({ where: { subscriptionId: id, kind: 'RECURRING', periodStart: dbDate(P), status: { not: 'VOID' } } });
    let invoiceId: string | undefined;
    if (!existing) {
      const lines = itemLines(items, { type: partial ? 'PRORATION' : 'SUBSCRIPTION', num, den, periodStart: P, periodEnd: end, label: ` — ${periodLabel(P, end)}` });
      const inv = await this.createDraft(tx, { kind: 'RECURRING', clientId: sub.clientId, currency: sub.currency, subscriptionId: id, billingRunId, periodStart: P, periodEnd: end, lines });
      await this.finalize(tx, inv.id, today, sub.paymentTermsDays, sub.clientProject.projectId);
      invoiceId = inv.id;
    }
    await tx.subscription.update({
      where: { id }, data: { currentPeriodStart: dbDate(P), currentPeriodEnd: dbDate(end), nextBillingOn: dbDate(end), rowVersion: { increment: 1 } },
    });
    return { invoiceId };
  }

  /** Davr o'rtasida tarifni oshirish: qolgan kunlar uchun PRORATION invoice (yangi − eski). */
  async prorationForUpgrade(tx: DbTx, sub: SubWithCp, oldItems: ItemSpec[], newItems: ItemSpec[], revisionId: string, today: string) {
    if (!sub.currentPeriodEnd || !['ACTIVE', 'PAST_DUE'].includes(sub.status)) return null;
    const end = fromDbDate(sub.currentPeriodEnd)!;
    if (today >= end) return null;
    const den = daysInMonth(today) * (newItems[0]?.intervalMonths ?? 1);
    const num = Math.min(diffDays(today, end), den);
    const label = ` — qayta hisob ${periodLabel(today, end)}`;
    const lines = [
      ...itemLines(newItems, { type: 'PRORATION', num, den, periodStart: today, periodEnd: end, label }),
      ...itemLines(oldItems, { type: 'PRORATION', num, den, periodStart: today, periodEnd: end, label: ' — oldingi tarifning foydalanilmagan qismi', credit: true }),
    ];
    if (sumLines(lines).total <= 0n) return null;
    const inv = await this.createDraft(tx, { kind: 'PRORATION', clientId: sub.clientId, currency: sub.currency, subscriptionId: sub.id, revisionId, periodStart: today, periodEnd: end, lines });
    await this.finalize(tx, inv.id, today, sub.paymentTermsDays, sub.clientProject.projectId);
    return inv.id;
  }

  async createOneTime(input: OneTimeInvoiceInput) {
    const client = await this.db.client.findFirst({ where: { id: input.clientId, deletedAt: null } });
    if (!client) throw notFound('Mijoz');
    const lines = input.lines.map((l) => line({
      type: 'ONE_TIME', description: l.description, planPriceId: null, periodStart: null, periodEnd: null, quantity: l.quantity,
      unitAmountMinor: parseMoney(l.unitAmount), prorationNum: 1, prorationDen: 1, vatRateBp: l.vatRateBp, ikpuCode: null, packageCode: null,
    }));
    const today = todayLocal();
    return this.db.$transaction(async (tx) => {
      const inv = await this.createDraft(tx, { kind: 'ONE_TIME', clientId: input.clientId, currency: input.currency, lines });
      const fin = await this.finalize(tx, inv.id, today, input.dueDays, null);
      return { id: inv.id, number: fin.number };
    });
  }

  /** USD invoice'ning hali yopilmagan UZS carrying qiymati (to'lovlar va credit note'lardan keyin). */
  async remainingCarrying(tx: DbOrTx, inv: Pick<Invoice, 'id' | 'currency' | 'totalMinor' | 'paidMinor' | 'creditedMinor' | 'totalUzsMinor'>): Promise<bigint> {
    if (inv.currency === 'UZS') return inv.totalMinor - inv.paidMinor - inv.creditedMinor;
    const rows = await tx.$queryRaw<{ alloc: bigint | null; cn: bigint | null }[]>`
      SELECT (SELECT sum(carrying_uzs_minor) FROM allocations WHERE invoice_id = ${inv.id}::uuid)::bigint AS alloc,
             (SELECT sum(jl.amount_uzs_minor) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
                JOIN credit_notes cn ON cn.id = je.source_id
               WHERE je.source_type = 'credit_note' AND cn.invoice_id = ${inv.id}::uuid AND jl.account_code = '1200')::bigint AS cn`;
    const r = rows[0]!;
    return (inv.totalUzsMinor ?? 0n) - BigInt(r.alloc ?? 0n) + BigInt(r.cn ?? 0n);
  }

  /** Invoice qismining UZS carrying qiymati (oxirgi qism qoldiqni oladi — yig'indi aynan totalUzs). */
  async carryingShare(tx: DbOrTx, inv: Invoice, amountInvoiceMinor: bigint): Promise<bigint> {
    if (inv.currency === 'UZS') return amountInvoiceMinor;
    const outstanding = inv.totalMinor - inv.paidMinor - inv.creditedMinor;
    if (amountInvoiceMinor === outstanding) return this.remainingCarrying(tx, inv);
    return mulDivRound(amountInvoiceMinor, inv.totalUzsMinor ?? 0n, inv.totalMinor);
  }

  /** Tasdiqlangan void: faqat to'lov/credit note bo'lmagan invoice; ledger yozuvi teskari qilinadi. */
  async executeVoid(tx: DbTx, invoiceId: string, reason: string, approvalRequestId: string | null) {
    const inv = await this.lockInvoice(tx, invoiceId);
    if (inv.status === 'VOID') throw conflict('Invoice allaqachon bekor qilingan');
    if (inv.status === 'DRAFT') throw conflict('Qoralama invoice void qilinmaydi');
    if (inv.paidMinor > 0n || inv.creditedMinor > 0n) throw conflict("Invoice'ga to'lov yoki credit note qo'llangan — avval taqsimotni bekor qiling");
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: reason, voidApprovalRequestId: approvalRequestId, rowVersion: { increment: 1 } },
    });
    const entry = await tx.journalEntry.findUnique({ where: { idempotencyKey: `invoice:${invoiceId}:finalize` }, include: { lines: true } });
    if (entry) {
      await this.ledger.post(tx, {
        key: `invoice:${invoiceId}:void`, date: todayLocal(), sourceType: 'invoice_void', sourceId: invoiceId, description: `VOID ${inv.number}`,
        lines: entry.lines.map((l) => ({ account: l.accountCode, currency: l.currency, amountMinor: -l.amountMinor, amountUzsMinor: -l.amountUzsMinor, clientId: l.clientId, projectId: l.projectId })),
      });
    }
    await this.audit.record(tx, { action: 'invoice.voided', resourceType: 'invoice', resourceId: invoiceId, reason, metadata: { number: inv.number } });
    await this.outbox.add(tx, { type: 'invoice.voided', eventKey: `invoice.voided:${invoiceId}`, aggregateType: 'invoice', aggregateId: invoiceId, payload: { number: inv.number, clientId: inv.clientId } });
  }

  /** Tasdiqlangan credit note: invoice qarzini kamaytiradi (DB trigger), ledger: Daromad/QQS ↔ AR. */
  async executeCreditNote(tx: DbTx, p: { invoiceId: string; amountMinor: bigint; reason: string; requestedById: string; approverId: string }) {
    const inv = await this.lockInvoice(tx, p.invoiceId);
    if (!['OPEN', 'UNCOLLECTIBLE'].includes(inv.status)) throw conflict("Faqat to'lanmagan invoice'ga credit note beriladi");
    const outstanding = inv.totalMinor - inv.paidMinor - inv.creditedMinor;
    if (p.amountMinor > outstanding) throw conflict("Credit note summasi invoice qoldig'idan katta");
    const vat = inv.totalMinor > 0n ? mulDivRound(p.amountMinor, inv.vatMinor, inv.totalMinor) : 0n;
    const arUzs = await this.carryingShare(tx, inv, p.amountMinor);
    const today = todayLocal();
    const number = await this.seq.code(tx, 'CN', { year: yearOf(today) });
    const cn = await tx.creditNote.create({
      data: {
        number, invoiceId: inv.id, clientId: inv.clientId, currency: inv.currency, amountMinor: p.amountMinor, vatMinor: vat, reason: p.reason,
        issuedAt: new Date(), createdById: p.requestedById, approvedById: p.approverId,
      },
    });
    const revUzs = vat > 0n ? mulDivRound(p.amountMinor - vat, arUzs, p.amountMinor) : arUzs;
    await this.ledger.post(tx, {
      key: `credit_note:${cn.id}`, date: today, sourceType: 'credit_note', sourceId: cn.id, description: `${number} → ${inv.number}`,
      lines: [
        { account: ACCOUNTS.REVENUE, currency: inv.currency, amountMinor: p.amountMinor - vat, amountUzsMinor: revUzs, clientId: inv.clientId, projectId: inv.subscription?.clientProject.projectId ?? null },
        { account: ACCOUNTS.VAT, currency: inv.currency, amountMinor: vat, amountUzsMinor: arUzs - revUzs, clientId: inv.clientId },
        { account: ACCOUNTS.AR, currency: inv.currency, amountMinor: -p.amountMinor, amountUzsMinor: -arUzs, clientId: inv.clientId },
      ],
    });
    await this.audit.record(tx, { action: 'credit_note.issued', resourceType: 'invoice', resourceId: inv.id, reason: p.reason, metadata: { number, amount: p.amountMinor.toString() } });
    await this.outbox.add(tx, { type: 'credit_note.issued', eventKey: `credit_note.issued:${cn.id}`, aggregateType: 'invoice', aggregateId: inv.id, payload: { number, clientId: inv.clientId } });
    return cn;
  }
}
