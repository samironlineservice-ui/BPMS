import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { convertMinor, type DashboardDto, dateString, type ReportsDto } from '@ads/contracts';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { addDays, addMonths, dayStart, dbDate, diffDays, fromDbDate, monthStart, nextMonthStart, TZ, todayLocal } from '../../platform/time.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { FinanceModule } from '../finance/finance.module.js';
import { FxService } from '../finance/fx.service.js';

const n = (v: bigint | number | null | undefined) => BigInt(v ?? 0);

/** Rahbar uchun ko'rsatkichlar va hisobotlar (OLTP'dan to'g'ridan-to'g'ri; hajm o'sganda snapshot jadvallarga o'tadi). */
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: Db, private readonly fx: FxService) {}

  async dashboard(auth: AuthContext): Promise<DashboardDto> {
    const today = todayLocal();
    const ms = monthStart(today);
    const rate = await this.fx.rateOn(today);
    const toUzs = (currency: string, minor: bigint) => (currency === 'UZS' ? minor : rate ? convertMinor(minor, rate.scaled) : 0n);
    const sumUzs = (rows: { currency: string; v: bigint }[]) => rows.reduce((s, r) => s + toUzs(r.currency, r.v), 0n);

    const [clientRows, approvals] = await Promise.all([
      this.db.$queryRaw<{ active: bigint; lead: bigint; fresh: bigint }[]>`
        SELECT count(*) FILTER (WHERE status = 'ACTIVE') AS active, count(*) FILTER (WHERE status = 'LEAD') AS lead,
               count(*) FILTER (WHERE created_at >= ${dayStart(ms)}) AS fresh FROM clients WHERE deleted_at IS NULL`,
      this.db.$queryRaw<{ c: bigint }[]>`
        SELECT (SELECT count(*) FROM approval_requests WHERE status = 'PENDING' AND expires_at > now())
             + (SELECT count(*) FROM payments WHERE status = 'PENDING_APPROVAL')
             + (SELECT count(*) FROM refunds WHERE status = 'REQUESTED') AS c`,
    ]);

    let finance: DashboardDto['finance'] = null;
    if (auth.permissions.has('invoices:read')) {
      const [mrr, ar, collected, invoiced, subs, top, upcoming, trendMrr, trendPay, trendInv] = await Promise.all([
        this.db.$queryRaw<{ currency: string; v: bigint }[]>`
          SELECT s.currency::text AS currency, sum(r.mrr_minor)::bigint AS v FROM subscriptions s
            JOIN subscription_revisions r ON r.subscription_id = s.id AND r.valid_to IS NULL
           WHERE s.status IN ('ACTIVE','PAST_DUE') GROUP BY s.currency`,
        this.db.$queryRaw<{ currency: string; receivable: bigint; overdue: bigint }[]>`
          SELECT currency::text AS currency, sum(total_minor - paid_minor - credited_minor)::bigint AS receivable,
                 sum(CASE WHEN due_date < ${dbDate(today)}::date THEN total_minor - paid_minor - credited_minor ELSE 0 END)::bigint AS overdue
            FROM invoices WHERE status IN ('OPEN','UNCOLLECTIBLE') GROUP BY currency`,
        this.db.$queryRaw<{ cur: bigint | null; prev: bigint | null }[]>`
          SELECT sum(amount_uzs_minor) FILTER (WHERE received_at >= ${dayStart(ms)})::bigint AS cur,
                 sum(amount_uzs_minor) FILTER (WHERE received_at < ${dayStart(ms)})::bigint AS prev
            FROM payments WHERE status = 'POSTED' AND received_at >= ${dayStart(addMonths(ms, -1))} AND received_at < ${dayStart(nextMonthStart(ms))}`,
        this.db.$queryRaw<{ v: bigint | null }[]>`
          SELECT sum(total_uzs_minor)::bigint AS v FROM invoices WHERE status NOT IN ('DRAFT','VOID') AND issue_date >= ${dbDate(ms)}::date`,
        this.db.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
        this.db.invoice.findMany({
          where: { status: { in: ['OPEN', 'UNCOLLECTIBLE'] }, dueDate: { lt: dbDate(today) } }, orderBy: { dueDate: 'asc' }, take: 6,
          include: { client: { select: { displayName: true } } },
        }),
        this.db.subscription.count({ where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] }, nextBillingOn: { gte: dbDate(today), lte: dbDate(addDays(today, 7)) } } }),
        this.db.$queryRaw<{ month: Date; currency: string | null; v: bigint }[]>`
          WITH months AS (SELECT generate_series(${dbDate(addMonths(ms, -11))}::date, ${dbDate(ms)}::date, interval '1 month')::date AS m)
          SELECT months.m AS month, s.currency::text AS currency, coalesce(sum(r.mrr_minor), 0)::bigint AS v
            FROM months
            LEFT JOIN subscription_revisions r ON r.status IN ('ACTIVE','PAST_DUE')
                 AND r.valid_from < ((months.m + interval '1 month')::timestamp AT TIME ZONE ${TZ})
                 AND (r.valid_to IS NULL OR r.valid_to >= ((months.m + interval '1 month')::timestamp AT TIME ZONE ${TZ}))
            LEFT JOIN subscriptions s ON s.id = r.subscription_id
           GROUP BY months.m, s.currency ORDER BY months.m`,
        this.db.$queryRaw<{ month: Date; v: bigint }[]>`
          SELECT date_trunc('month', received_at AT TIME ZONE ${TZ})::date AS month, sum(amount_uzs_minor)::bigint AS v
            FROM payments WHERE status = 'POSTED' AND received_at >= ${dayStart(addMonths(ms, -11))} GROUP BY 1`,
        this.db.$queryRaw<{ month: Date; v: bigint }[]>`
          SELECT date_trunc('month', issue_date)::date AS month, sum(total_uzs_minor)::bigint AS v
            FROM invoices WHERE status NOT IN ('DRAFT','VOID') AND issue_date >= ${dbDate(addMonths(ms, -11))}::date GROUP BY 1`,
      ]);
      const count = (s: string) => subs.find((x) => x.status === s)?._count._all ?? 0;
      const months = Array.from({ length: 12 }, (_, i) => addMonths(ms, i - 11));
      const byMonth = <T extends { month: Date }>(rows: T[], m: string) => rows.filter((r) => fromDbDate(r.month) === m);
      finance = {
        mrr: mrr.map((r) => ({ currency: r.currency, amountMinor: n(r.v).toString() })),
        mrrUzsMinor: sumUzs(mrr.map((r) => ({ currency: r.currency, v: n(r.v) }))).toString(),
        receivable: ar.map((r) => ({ currency: r.currency, amountMinor: n(r.receivable).toString() })),
        overdue: ar.map((r) => ({ currency: r.currency, amountMinor: n(r.overdue).toString() })),
        receivableUzsMinor: sumUzs(ar.map((r) => ({ currency: r.currency, v: n(r.receivable) }))).toString(),
        overdueUzsMinor: sumUzs(ar.map((r) => ({ currency: r.currency, v: n(r.overdue) }))).toString(),
        collectedThisMonthUzsMinor: n(collected[0]?.cur).toString(), collectedPrevMonthUzsMinor: n(collected[0]?.prev).toString(),
        invoicedThisMonthUzsMinor: n(invoiced[0]?.v).toString(),
        subscriptions: { active: count('ACTIVE'), trialing: count('TRIALING'), pastDue: count('PAST_DUE'), suspended: count('SUSPENDED') },
        trend: months.map((m) => ({
          month: m,
          mrrUzsMinor: byMonth(trendMrr, m).reduce((s, r) => s + (r.currency ? toUzs(r.currency, n(r.v)) : 0n), 0n).toString(),
          collectedUzsMinor: byMonth(trendPay, m).reduce((s, r) => s + n(r.v), 0n).toString(),
          invoicedUzsMinor: byMonth(trendInv, m).reduce((s, r) => s + n(r.v), 0n).toString(),
        })),
        topOverdue: top.map((i) => ({
          id: i.id, number: i.number, clientId: i.clientId, clientName: i.client.displayName, currency: i.currency,
          outstandingMinor: (i.totalMinor - i.paidMinor - i.creditedMinor).toString(), dueDate: fromDbDate(i.dueDate), overdueDays: i.dueDate ? diffDays(fromDbDate(i.dueDate)!, today) : 0,
        })),
        upcomingBilling: upcoming,
      };
    }

    let ops: DashboardDto['ops'] = null;
    if (auth.permissions.has('devices:read')) {
      const [byClass, running, pending, failed] = await Promise.all([
        this.db.device.groupBy({ by: ['deviceClass'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
        this.db.deployment.count({ where: { status: { in: ['RUNNING', 'PAUSED', 'SCHEDULED'] } } }),
        this.db.deployment.count({ where: { status: 'PENDING_APPROVAL' } }),
        this.db.deployment.count({ where: { status: 'FAILED', completedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      ]);
      ops = {
        devicesActive: byClass.reduce((s, r) => s + r._count._all, 0),
        devicesByClass: byClass.map((r) => ({ deviceClass: r.deviceClass, count: r._count._all })).sort((a, b) => b.count - a.count),
        deploymentsRunning: running, deploymentsPendingApproval: pending, deploymentsFailed30d: failed,
      };
    }

    const c = clientRows[0]!;
    return {
      asOf: today, usdRate: rate?.str ?? null, finance,
      clients: { active: Number(c.active), lead: Number(c.lead), newThisMonth: Number(c.fresh) },
      ops, approvalsPending: Number(approvals[0]?.c ?? 0),
    };
  }

  async reports(from: string, to: string): Promise<ReportsDto> {
    const today = todayLocal();
    const [movements, aging, revenue, methods, top] = await Promise.all([
      this.db.$queryRaw<{ month: Date; type: string; currency: string; v: bigint }[]>`
        SELECT date_trunc('month', occurred_at AT TIME ZONE ${TZ})::date AS month, type::text, currency::text, sum(delta_minor)::bigint AS v
          FROM mrr_movements WHERE occurred_at >= ${dayStart(from)} AND occurred_at < ${dayStart(addDays(to, 1))} GROUP BY 1, 2, 3 ORDER BY 1`,
      this.db.$queryRaw<{ currency: string; bucket: string; v: bigint; c: bigint }[]>`
        SELECT currency::text, CASE WHEN due_date >= ${dbDate(today)}::date THEN 'current'
                                    WHEN ${dbDate(today)}::date - due_date <= 30 THEN '1-30'
                                    WHEN ${dbDate(today)}::date - due_date <= 60 THEN '31-60'
                                    WHEN ${dbDate(today)}::date - due_date <= 90 THEN '61-90' ELSE '90+' END AS bucket,
               sum(total_minor - paid_minor - credited_minor)::bigint AS v, count(*) AS c
          FROM invoices WHERE status IN ('OPEN','UNCOLLECTIBLE') GROUP BY 1, 2`,
      this.db.$queryRaw<{ project_id: string | null; name: string | null; currency: string; v: bigint; u: bigint }[]>`
        SELECT jl.project_id::text, p.name, jl.currency::text, (-sum(jl.amount_minor))::bigint AS v, (-sum(jl.amount_uzs_minor))::bigint AS u
          FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id LEFT JOIN projects p ON p.id = jl.project_id
         WHERE jl.account_code = '4000' AND je.effective_date BETWEEN ${dbDate(from)}::date AND ${dbDate(to)}::date
         GROUP BY 1, 2, 3 ORDER BY 5 DESC`,
      this.db.$queryRaw<{ method: string; currency: string; v: bigint; c: bigint }[]>`
        SELECT method::text, currency::text, sum(amount_minor)::bigint AS v, count(*) AS c FROM payments
         WHERE status = 'POSTED' AND received_at >= ${dayStart(from)} AND received_at < ${dayStart(addDays(to, 1))} GROUP BY 1, 2 ORDER BY 3 DESC`,
      this.db.$queryRaw<{ client_id: string; name: string; u: bigint }[]>`
        SELECT p.client_id::text, c.display_name AS name, sum(p.amount_uzs_minor)::bigint AS u FROM payments p JOIN clients c ON c.id = p.client_id
         WHERE p.status = 'POSTED' AND p.received_at >= ${dayStart(from)} AND p.received_at < ${dayStart(addDays(to, 1))}
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10`,
    ]);
    return {
      from, to,
      mrrMovements: movements.map((r) => ({ month: fromDbDate(r.month)!, type: r.type, currency: r.currency, deltaMinor: n(r.v).toString() })),
      aging: aging.map((r) => ({ currency: r.currency, bucket: r.bucket, amountMinor: n(r.v).toString(), invoices: Number(r.c) })),
      revenueByProject: revenue.map((r) => ({ projectId: r.project_id, projectName: r.name ?? 'Loyihasiz (bir martalik)', currency: r.currency, amountMinor: n(r.v).toString(), amountUzsMinor: n(r.u).toString() })),
      paymentsByMethod: methods.map((r) => ({ method: r.method, currency: r.currency, amountMinor: n(r.v).toString(), count: Number(r.c) })),
      topClients: top.map((r) => ({ clientId: r.client_id, clientName: r.name, amountUzsMinor: n(r.u).toString() })),
    };
  }
}

const reportsQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

@Controller()
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('dashboard') @RequirePermissions('dashboard:read')
  dashboard(@Auth() a: AuthContext) { return this.svc.dashboard(a); }

  @Get('reports') @RequirePermissions('analytics:read')
  reports(@Query(new ZodPipe(reportsQuery)) q: z.infer<typeof reportsQuery>) {
    const to = q.to ?? todayLocal();
    return this.svc.reports(q.from ?? addMonths(monthStart(to), -11), to);
  }
}

@Module({ imports: [FinanceModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
