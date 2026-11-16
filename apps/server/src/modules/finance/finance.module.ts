import { Body, Controller, Get, Injectable, Module, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { dateString, fxRateManualSchema, type PeriodDto, type StatementDto, statementQuerySchema, type TrialBalanceRow } from '@ads/contracts';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { notFound } from '../../platform/errors.js';
import { dbDate, fromDbDate, todayLocal } from '../../platform/time.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { FxService } from './fx.service.js';
import { LedgerService } from './ledger.service.js';
import { StatementPdfService } from './statement-pdf.service.js';

const SOURCE_LABELS: Record<string, string> = {
  invoice: 'Invoice', payment: "To'lov", allocation: 'Valyuta ayirboshlash (taqsimot)', credit_note: 'Credit note', invoice_void: 'Invoice bekor qilindi',
  refund: 'Pul qaytarildi', fx_revaluation: 'Kurs farqi (qayta baholash)',
};

@Injectable()
export class FinanceService {
  constructor(private readonly db: Db) {}

  async periods(): Promise<PeriodDto[]> {
    const rows = await this.db.$queryRaw<{ month: Date; fx: Date | null; closed: Date | null; closed_by: string | null; entries: bigint }[]>`
      SELECT fp.month, fp.fx_revalued_at AS fx, fp.closed_at AS closed, u.full_name AS closed_by,
             (SELECT count(*) FROM journal_entries je WHERE date_trunc('month', je.effective_date) = fp.month) AS entries
        FROM financial_periods fp LEFT JOIN users u ON u.id = fp.closed_by_id ORDER BY fp.month DESC`;
    return rows.map((r) => ({ month: fromDbDate(r.month)!, fxRevaluedAt: r.fx?.toISOString() ?? null, closedAt: r.closed?.toISOString() ?? null, closedBy: r.closed_by, entries: Number(r.entries) }));
  }

  /** Akt-sverka: ledger'dan (AR 1200 + avanslar 2100) mijoz × valyuta kesimida. Ichki taqsimotlar (nol yig'indi) ko'rsatilmaydi. */
  async statement(q: z.infer<typeof statementQuerySchema>): Promise<StatementDto> {
    const client = await this.db.client.findUnique({ where: { id: q.clientId } });
    if (!client) throw notFound('Mijoz');
    const opening = await this.db.$queryRaw<{ s: bigint | null }[]>`
      SELECT sum(jl.amount_minor)::bigint AS s FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.client_id = ${q.clientId}::uuid AND jl.currency = ${q.currency}::"Currency" AND jl.account_code IN ('1200','2100')
         AND je.effective_date < ${dbDate(q.from)}::date`;
    const rows = await this.db.$queryRaw<{ id: string; d: Date; source_type: string; source_id: string; description: string | null; amount: bigint }[]>`
      SELECT je.id::text, je.effective_date AS d, je.source_type, je.source_id::text, je.description, sum(jl.amount_minor)::bigint AS amount
        FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.client_id = ${q.clientId}::uuid AND jl.currency = ${q.currency}::"Currency" AND jl.account_code IN ('1200','2100')
         AND je.effective_date BETWEEN ${dbDate(q.from)}::date AND ${dbDate(q.to)}::date
       GROUP BY je.id HAVING sum(jl.amount_minor) <> 0 ORDER BY je.effective_date, je.posted_at`;
    let bal = BigInt(opening[0]?.s ?? 0n);
    const openingMinor = bal;
    let debit = 0n; let credit = 0n;
    const lines = rows.map((r) => {
      const amt = BigInt(r.amount);
      bal += amt;
      if (amt > 0n) debit += amt; else credit += -amt;
      return {
        date: fromDbDate(r.d)!, ref: r.description ?? '', description: SOURCE_LABELS[r.source_type] ?? r.source_type, sourceType: r.source_type, sourceId: r.source_id,
        debitMinor: (amt > 0n ? amt : 0n).toString(), creditMinor: (amt < 0n ? -amt : 0n).toString(), balanceMinor: bal.toString(),
      };
    });
    return {
      client: { id: client.id, code: client.code, name: client.displayName }, currency: q.currency, from: q.from, to: q.to,
      openingMinor: openingMinor.toString(), closingMinor: bal.toString(), debitTotalMinor: debit.toString(), creditTotalMinor: credit.toString(), lines,
    };
  }

  async trialBalance(asOf: string): Promise<TrialBalanceRow[]> {
    const rows = await this.db.$queryRaw<{ code: string; name: string; type: string; debit: bigint | null; credit: bigint | null }[]>`
      SELECT la.code, la.name, la.type::text, t.debit, t.credit FROM ledger_accounts la LEFT JOIN (
        SELECT jl.account_code, sum(GREATEST(jl.amount_uzs_minor, 0))::bigint AS debit, sum(GREATEST(-jl.amount_uzs_minor, 0))::bigint AS credit
          FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.effective_date <= ${dbDate(asOf)}::date GROUP BY jl.account_code
      ) t ON t.account_code = la.code ORDER BY la.code`;
    return rows.map((r) => {
      const d = BigInt(r.debit ?? 0n); const c = BigInt(r.credit ?? 0n);
      return { code: r.code, name: r.name, type: r.type, debitUzsMinor: d.toString(), creditUzsMinor: c.toString(), balanceUzsMinor: (d - c).toString() };
    });
  }

  async journal(q: { page: number; pageSize: number; account?: string; clientId?: string }) {
    const where = {
      ...(q.account || q.clientId ? { lines: { some: { ...(q.account ? { accountCode: q.account } : {}), ...(q.clientId ? { clientId: q.clientId } : {}) } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.journalEntry.findMany({
        where, include: { lines: { include: { account: true } } }, orderBy: [{ effectiveDate: 'desc' }, { postedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      }),
      this.db.journalEntry.count({ where }),
    ]);
    return {
      total, page: q.page, pageSize: q.pageSize,
      items: rows.map((e) => ({
        id: e.id, date: fromDbDate(e.effectiveDate), sourceType: e.sourceType, sourceId: e.sourceId, description: e.description, postedAt: e.postedAt.toISOString(),
        lines: e.lines.map((l) => ({
          account: l.accountCode, accountName: l.account.name, currency: l.currency, amountMinor: l.amountMinor.toString(), amountUzsMinor: l.amountUzsMinor.toString(), clientId: l.clientId,
        })),
      })),
    };
  }
}

const fetchSchema = z.object({ date: dateString.optional() });
const journalQuery = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30),
  account: z.string().max(10).optional(), clientId: z.uuid().optional(),
});

@Controller('finance')
export class FinanceController {
  constructor(private readonly fx: FxService, private readonly finance: FinanceService, private readonly statementPdf: StatementPdfService) {}

  @Get('fx-rates') @RequirePermissions('finance:read')
  rates() { return this.fx.list(); }

  @Post('fx-rates') @RequirePermissions('finance:manage_fx')
  addRate(@Body(new ZodPipe(fxRateManualSchema)) b: z.infer<typeof fxRateManualSchema>, @Auth() a: AuthContext) { return this.fx.addManual(b.date, b.rate, a.userId); }

  @Post('fx-rates/fetch') @RequirePermissions('finance:manage_fx')
  fetch(@Body(new ZodPipe(fetchSchema)) b: z.infer<typeof fetchSchema>) { return this.fx.fetchCbu(b.date ?? todayLocal()); }

  @Get('periods') @RequirePermissions('finance:read')
  periods() { return this.finance.periods(); }

  @Get('statement') @RequirePermissions('finance:read')
  statement(@Query(new ZodPipe(statementQuerySchema)) q: z.infer<typeof statementQuerySchema>) { return this.finance.statement(q); }

  @Get('statement/pdf') @RequirePermissions('finance:read')
  async statementPdfFile(@Query(new ZodPipe(statementQuerySchema)) q: z.infer<typeof statementQuerySchema>, @Res() reply: FastifyReply) {
    const { buffer, filename } = await this.statementPdf.render(await this.finance.statement(q));
    return reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="${filename}"`).header('cache-control', 'private, no-store').send(buffer);
  }

  @Get('trial-balance') @RequirePermissions('finance:read')
  trialBalance(@Query(new ZodPipe(z.object({ asOf: dateString.optional() }))) q: { asOf?: string }) { return this.finance.trialBalance(q.asOf ?? todayLocal()); }

  @Get('journal') @RequirePermissions('finance:read')
  journal(@Query(new ZodPipe(journalQuery)) q: z.infer<typeof journalQuery>) { return this.finance.journal(q); }
}

@Module({ controllers: [FinanceController], providers: [FxService, LedgerService, FinanceService, StatementPdfService], exports: [FxService, LedgerService, FinanceService, StatementPdfService] })
export class FinanceModule {}

