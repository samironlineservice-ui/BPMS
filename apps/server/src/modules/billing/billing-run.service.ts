import { Injectable, Logger } from '@nestjs/common';
import { convertMinor } from '@ads/contracts';
import type { BillingRunDto } from '@ads/contracts';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { conflict, notFound } from '../../platform/errors.js';
import { dbDate, fromDbDate, monthEnd, monthStart, nextMonthStart, todayLocal } from '../../platform/time.js';
import { FxService } from '../finance/fx.service.js';
import { ACCOUNTS, LedgerService, type PostLine } from '../finance/ledger.service.js';
import { BILLABLE } from './helpers.js';
import { InvoicingService } from './invoicing.service.js';
import { PaymentsService } from './payments.service.js';

@Injectable()
export class BillingRunService {
  private readonly log = new Logger('BillingRun');
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly invoicing: InvoicingService, private readonly payments: PaymentsService,
    private readonly fx: FxService, private readonly ledger: LedgerService,
  ) {}

  /** Kunlik billing: muddati kelgan obunalar uchun invoice. Idempotent (DB unique: obuna × davr). */
  async run(today = todayLocal()) {
    let run = await this.db.billingRun.findUnique({ where: { runDate: dbDate(today) } });
    run = run
      ? await this.db.billingRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: new Date(), finishedAt: null } })
      : await this.db.billingRun.create({ data: { runDate: dbDate(today), startedAt: new Date() } });
    const due = await this.db.subscription.findMany({
      where: { status: { in: [...BILLABLE] }, nextBillingOn: { lte: dbDate(today) } }, select: { id: true, code: true, clientId: true }, orderBy: { nextBillingOn: 'asc' },
    });
    let invoiced = 0;
    const errors: { code: string; error: string }[] = [];
    const clients = new Set<string>();
    for (const s of due) {
      try {
        const r = await this.invoicing.billSubscription(s.id, today, run.id);
        invoiced += r.invoices.length;
        if (r.invoices.length) clients.add(s.clientId);
      } catch (e) {
        errors.push({ code: s.code, error: (e as Error).message });
        this.log.error(`${s.code}: ${(e as Error).message}`);
      }
    }
    for (const c of clients) await this.payments.autoAllocate(c).catch((e: Error) => this.log.error(`autoAllocate ${c}: ${e.message}`));
    const done = await this.db.billingRun.update({
      where: { id: run.id },
      data: {
        status: errors.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', enqueued: due.length, invoiced: { increment: invoiced }, failed: errors.length,
        errors: errors.length ? errors : undefined, finishedAt: new Date(),
      },
    });
    this.log.log(`billing ${today}: ${due.length} obuna, ${invoiced} invoice, ${errors.length} xato`);
    return this.toDto(done);
  }

  toDto(r: { id: string; runDate: Date; status: string; enqueued: number; invoiced: number; failed: number; errors: unknown; startedAt: Date; finishedAt: Date | null }): BillingRunDto {
    return {
      id: r.id, runDate: fromDbDate(r.runDate)!, status: r.status, enqueued: r.enqueued, invoiced: r.invoiced, failed: r.failed, errors: r.errors,
      startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }

  async runs(limit = 30): Promise<BillingRunDto[]> {
    const rows = await this.db.billingRun.findMany({ orderBy: { runDate: 'desc' }, take: limit });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * Oy oxiri: ochiq USD debitorlikni oxirgi kun kursida qayta baholash (unrealized FX, 7150/7250)
   * va keyingi oyning 1-sanasida avtomatik teskari yozuv. Davrni yopishdan oldin majburiy.
   */
  async revalue(month: string, auth: AuthContext) {
    month = monthStart(month);
    const period = await this.db.financialPeriod.findUnique({ where: { month: dbDate(month) } });
    if (!period) throw notFound('Moliyaviy davr');
    if (period.closedAt) throw conflict('Davr yopilgan');
    if (period.fxRevaluedAt) throw conflict('Bu oy allaqachon qayta baholangan');
    const end = monthEnd(month);
    const invoices = await this.db.invoice.findMany({
      where: { currency: 'USD', status: { in: ['OPEN', 'UNCOLLECTIBLE'] }, issueDate: { lte: dbDate(end) } },
    });
    const byClient = new Map<string, bigint>();
    let rateStr: string | null = null;
    if (invoices.length) {
      const rate = await this.fx.requireRate(end);
      rateStr = rate.str;
      for (const inv of invoices) {
        const outstanding = inv.totalMinor - inv.paidMinor - inv.creditedMinor;
        if (outstanding <= 0n) continue;
        const carrying = await this.invoicing.remainingCarrying(this.db, inv);
        const diff = convertMinor(outstanding, rate.scaled) - carrying;
        if (diff !== 0n) byClient.set(inv.clientId, (byClient.get(inv.clientId) ?? 0n) + diff);
      }
    }
    await this.db.$transaction(async (tx) => {
      if (byClient.size) {
        const lines: PostLine[] = [];
        let gain = 0n; let loss = 0n;
        for (const [clientId, diff] of byClient) {
          lines.push({ account: ACCOUNTS.AR, currency: 'USD', amountMinor: 0n, amountUzsMinor: diff, clientId });
          if (diff > 0n) gain += diff; else loss += -diff;
        }
        if (gain) lines.push({ account: ACCOUNTS.FX_UNREALIZED_GAIN, currency: 'UZS', amountMinor: -gain, amountUzsMinor: -gain });
        if (loss) lines.push({ account: ACCOUNTS.FX_UNREALIZED_LOSS, currency: 'UZS', amountMinor: loss, amountUzsMinor: loss });
        await this.ledger.post(tx, { key: `fx_reval:${month}`, date: end, sourceType: 'fx_revaluation', sourceId: auth.userId, description: `FX qayta baholash ${month.slice(0, 7)} @ ${rateStr}`, lines });
        await this.ledger.post(tx, {
          key: `fx_reval:${month}:reverse`, date: nextMonthStart(month), sourceType: 'fx_revaluation', sourceId: auth.userId, description: `FX qayta baholash (teskari) ${month.slice(0, 7)}`,
          lines: lines.map((l) => ({ ...l, amountMinor: -l.amountMinor, amountUzsMinor: -l.amountUzsMinor })),
        });
      }
      await tx.financialPeriod.update({ where: { month: dbDate(month) }, data: { fxRevaluedAt: new Date() } });
      await this.audit.record(tx, { action: 'finance.fx_revalued', resourceType: 'financial_period', metadata: { month, clients: byClient.size, rate: rateStr } });
    });
    return { ok: true, clients: byClient.size, rate: rateStr };
  }

  async close(month: string, auth: AuthContext) {
    month = monthStart(month);
    const period = await this.db.financialPeriod.findUnique({ where: { month: dbDate(month) } });
    if (!period) throw notFound('Moliyaviy davr');
    if (period.closedAt) throw conflict('Davr allaqachon yopilgan');
    if (!period.fxRevaluedAt) throw conflict('Avval valyuta qayta baholashini bajaring');
    if (month >= monthStart(todayLocal())) throw conflict("Joriy yoki kelgusi oyni yopib bo'lmaydi");
    const earlierOpen = await this.db.financialPeriod.count({ where: { month: { lt: dbDate(month) }, closedAt: null } });
    if (earlierOpen) throw conflict('Avval oldingi oylarni yoping');
    await this.db.$transaction(async (tx) => {
      await tx.financialPeriod.update({ where: { month: dbDate(month) }, data: { closedAt: new Date(), closedById: auth.userId } });
      await this.audit.record(tx, { action: 'finance.period_closed', resourceType: 'financial_period', metadata: { month } });
    });
    return { ok: true };
  }
}
