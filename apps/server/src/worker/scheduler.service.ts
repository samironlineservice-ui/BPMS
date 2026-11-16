import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Cron } from 'croner';
import { Db } from '../platform/db.service.js';
import { TZ, todayLocal } from '../platform/time.js';
import { BillingRunService } from '../modules/billing/billing-run.service.js';
import { DunningService } from '../modules/billing/dunning.service.js';
import { FxService } from '../modules/finance/fx.service.js';
import { LedgerService } from '../modules/finance/ledger.service.js';
import { GatewayJobsService } from '../modules/gateways/gateways.module.js';
import { dbDate } from '../platform/time.js';
import { EventBus } from './event-bus.js';

/** Rejali ishlar. Har bir ish PostgreSQL advisory lock bilan — bir nechta worker bo'lsa ham bitta nusxa ishlaydi. */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Scheduler');
  private readonly jobs: Cron[] = [];
  private relayTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(
    private readonly db: Db, private readonly billing: BillingRunService, private readonly dunning: DunningService,
    private readonly fx: FxService, private readonly ledger: LedgerService, private readonly bus: EventBus, private readonly gw: GatewayJobsService,
  ) {}

  private async locked(name: string, fn: () => Promise<unknown>) {
    const started = Date.now();
    try {
      await this.db.$transaction(async (tx) => {
        const [r] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`ads:${name}`})) AS ok`;
        if (!r?.ok) { this.log.warn(`${name}: boshqa worker bajarmoqda — o'tkazib yuborildi`); return; }
        const res = await fn();
        this.log.log(`${name}: ${JSON.stringify(res ?? 'ok').slice(0, 300)} (${Date.now() - started} ms)`);
      }, { timeout: 60 * 60_000, maxWait: 30_000 });
    } catch (e) {
      this.log.error(`${name}: ${(e as Error).message}`);
    }
  }

  private schedule(name: string, pattern: string, fn: () => Promise<unknown>) {
    this.jobs.push(new Cron(pattern, { timezone: TZ, protect: true, name }, () => this.locked(name, fn)));
  }

  async onApplicationBootstrap() {
    this.schedule('periods.ensure', '1 0 * * *', () => this.ledger.ensurePeriod(this.db, todayLocal()));
    this.schedule('fx.cbu', '0 9,12,17 * * *', () => this.fx.fetchCbu(todayLocal()));
    this.schedule('billing.run', '10 0 * * *', () => this.billing.run());
    this.schedule('dunning', '0 9 * * *', () => this.dunning.run());
    this.schedule('gateways.expire', '*/5 * * * *', () => this.gw.expire());
    this.schedule('checkout.fulfill', '*/10 * * * *', () => this.gw.retryFulfillment());
    this.schedule('autopay', '0 10 * * *', () => this.gw.autopay());
    this.schedule('approvals.expire', '*/30 * * * *', () =>
      this.db.approvalRequest.updateMany({ where: { status: 'PENDING', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } }));
    this.schedule('sessions.cleanup', '30 3 * * *', () =>
      this.db.session.deleteMany({ where: { OR: [{ absoluteExpiresAt: { lt: new Date(Date.now() - 30 * 86_400_000) } }, { revokedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } }] } }));
    this.schedule('auth_tokens.cleanup', '40 3 * * *', () => this.db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } }));

    // Ishga tushganda o'tkazib yuborilgan kunlik ishlarni bajarish (idempotent)
    void (async () => {
      await this.locked('periods.ensure', () => this.ledger.ensurePeriod(this.db, todayLocal()));
      const hasRate = await this.fx.rateOn(todayLocal(), this.db, 0);
      if (!hasRate) await this.locked('fx.cbu', () => this.fx.fetchCbu(todayLocal()));
      const run = await this.db.billingRun.findUnique({ where: { runDate: dbDate(todayLocal()) } });
      if (!run || run.status !== 'COMPLETED') await this.locked('billing.run', () => this.billing.run());
      await this.locked('dunning', () => this.dunning.run());
    })();
    this.relayLoop();
    this.log.log(`Rejali ishlar (${TZ}): ${this.jobs.map((j) => `${j.name} [${j.getPattern()}]`).join(', ')}`);
  }

  /** Transactional outbox relay: e'lon qilinmagan event'lar → event bus (FOR UPDATE SKIP LOCKED). */
  private relayLoop() {
    const tick = async () => {
      if (this.stopping) return;
      let n = 0;
      try { n = await this.relayBatch(); } catch (e) { this.log.error(`outbox: ${(e as Error).message}`); }
      this.relayTimer = setTimeout(() => void tick(), n > 0 ? 200 : 3000);
    };
    void tick();
  }

  private async relayBatch(): Promise<number> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM outbox_events WHERE published_at IS NULL AND attempts < 10 ORDER BY occurred_at LIMIT 50 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return 0;
      const events = await tx.outboxEvent.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: { occurredAt: 'asc' } });
      for (const e of events) {
        const failed = await this.bus.publish(e);
        await tx.outboxEvent.update({
          where: { id: e.id },
          data: failed.length ? { attempts: { increment: 1 }, lastError: `failed: ${failed.join(', ')}` } : { publishedAt: new Date(), attempts: { increment: 1 } },
        });
      }
      return events.length;
    }, { timeout: 120_000 });
  }

  onApplicationShutdown() {
    this.stopping = true;
    if (this.relayTimer) clearTimeout(this.relayTimer);
    for (const j of this.jobs) j.stop();
  }
}
