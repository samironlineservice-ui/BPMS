import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../../platform/db.service.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { addDays, dbDate, fromDbDate, todayLocal } from '../../platform/time.js';
import { InvoicingService } from './invoicing.service.js';
import { LifecycleService } from './lifecycle.service.js';

/** Juda kichik qoldiq (valyutalararo yaxlitlash) qarz hisoblanmaydi: 1 sent / 1 so'm. */
export const DUST = { USD: 1n, UZS: 100n } as const;

/** Muddati o'tgan to'lovlar: ACTIVE → PAST_DUE → (grace) → SUSPENDED; to'lovdan keyin → ACTIVE. */
@Injectable()
export class DunningService {
  private readonly log = new Logger('Dunning');
  constructor(private readonly db: Db, private readonly outbox: OutboxService, private readonly lifecycle: LifecycleService, private readonly invoicing: InvoicingService) {}

  /** Obunaning eng eski muddati o'tgan (to'lanmagan) invoice sanasi. */
  private async oldestOverdue(subscriptionId: string, today: string): Promise<string | null> {
    const rows = await this.db.$queryRaw<{ due: Date | null }[]>`
      SELECT min(due_date) AS due FROM invoices
       WHERE subscription_id = ${subscriptionId}::uuid AND status IN ('OPEN','UNCOLLECTIBLE') AND due_date < ${dbDate(today)}::date
         AND total_minor - paid_minor - credited_minor > CASE currency WHEN 'USD' THEN ${DUST.USD}::bigint ELSE ${DUST.UZS}::bigint END`;
    return fromDbDate(rows[0]?.due ?? null);
  }

  async run(today = todayLocal()) {
    const stats = { pastDue: 0, suspended: 0, reactivated: 0, overdueInvoices: 0 };
    // 1) Yangi muddati o'tgan invoice'lar (bildirishnoma uchun bir marta)
    const newly = await this.db.invoice.findMany({
      where: { status: 'OPEN', dueDate: { lt: dbDate(today) }, overdueNotifiedAt: null }, select: { id: true, number: true, clientId: true },
    });
    for (const inv of newly) {
      await this.db.$transaction(async (tx) => {
        await tx.invoice.update({ where: { id: inv.id }, data: { overdueNotifiedAt: new Date() } });
        await this.outbox.add(tx, { type: 'invoice.overdue', eventKey: `invoice.overdue:${inv.id}`, aggregateType: 'invoice', aggregateId: inv.id, payload: { number: inv.number, clientId: inv.clientId } });
      });
      stats.overdueInvoices++;
    }
    // 2) ACTIVE / PAST_DUE / SUSPENDED obunalarni qayta baholash
    const subs = await this.db.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE', 'SUSPENDED'] } }, select: { id: true } });
    for (const s of subs) {
      try {
        const r = await this.evaluate(s.id, today);
        if (r) stats[r]++;
      } catch (e) {
        this.log.error(`dunning ${s.id}: ${(e as Error).message}`);
      }
    }
    return stats;
  }

  private async evaluate(id: string, today: string): Promise<'pastDue' | 'suspended' | 'reactivated' | null> {
    const overdueSince = await this.oldestOverdue(id, today);
    const result = await this.db.$transaction(async (tx) => {
      const sub = await this.lifecycle.lock(tx, id);
      if (sub.status === 'ACTIVE' && overdueSince) {
        await this.lifecycle.transition(tx, sub, 'PAST_DUE', { reason: `To'lov muddati o'tdi (${overdueSince})`, pastDueSince: addDays(overdueSince, 1) });
        return 'pastDue' as const;
      }
      if (sub.status === 'PAST_DUE' && overdueSince) {
        const since = fromDbDate(sub.pastDueSince)!;
        if (today >= addDays(since, sub.graceDays)) {
          await this.lifecycle.transition(tx, sub, 'SUSPENDED', { reason: `Imtiyozli muddat (${sub.graceDays} kun) tugadi` });
          return 'suspended' as const;
        }
        return null;
      }
      if ((sub.status === 'PAST_DUE' || sub.status === 'SUSPENDED') && !overdueSince) {
        const nb = fromDbDate(sub.nextBillingOn);
        await this.lifecycle.transition(tx, sub, 'ACTIVE', {
          reason: "Qarz to'landi", reactivation: sub.status === 'SUSPENDED',
          ...(sub.status === 'SUSPENDED' && nb && nb < today ? { nextBillingOn: today } : {}),
        });
        return 'reactivated' as const;
      }
      return null;
    });
    if (result === 'reactivated') await this.invoicing.billSubscription(id, today);
    return result;
  }

  /** To'lov taqsimlangandan keyin darhol chaqiriladi. */
  async reconcile(subscriptionId: string) {
    try { await this.evaluate(subscriptionId, todayLocal()); } catch (e) { this.log.error(`reconcile ${subscriptionId}: ${(e as Error).message}`); }
  }
}
