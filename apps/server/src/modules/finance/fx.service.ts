import { Injectable, Logger } from '@nestjs/common';
import { parseRate, rateToString } from '@ads/contracts';
import { env } from '../../config/env.js';
import { AuditService } from '../../platform/audit.service.js';
import { Db, type DbOrTx } from '../../platform/db.service.js';
import { AppError, conflict } from '../../platform/errors.js';
import { addDays, dbDate, fromDbDate } from '../../platform/time.js';

export interface Rate { id: string; scaled: bigint; str: string; date: string; source: string }

/** 1 USD = X UZS. Kurslar o'zgarmaydi (append-only); hujjatlarga nusxa olinadi. */
@Injectable()
export class FxService {
  private readonly log = new Logger('FX');
  constructor(private readonly db: Db, private readonly audit: AuditService) {}

  /** `date` yoki undan oldingi eng yaqin kurs (maxAgeDays ichida). CBU afzal. */
  async rateOn(date: string, db: DbOrTx = this.db, maxAgeDays = 7): Promise<Rate | null> {
    const rows = await db.fxRate.findMany({
      where: { base: 'USD', quote: 'UZS', effectiveDate: { lte: dbDate(date), gte: dbDate(addDays(date, -maxAgeDays)) } },
      orderBy: [{ effectiveDate: 'desc' }, { source: 'asc' }], // CBU < MANUAL (enum tartibi)
      take: 2,
    });
    const r = rows[0];
    if (!r) return null;
    const str = r.rate.toString();
    return { id: r.id, scaled: parseRate(str), str: rateToString(parseRate(str)), date: fromDbDate(r.effectiveDate)!, source: r.source };
  }

  async requireRate(date: string, db: DbOrTx = this.db): Promise<Rate> {
    const r = await this.rateOn(date, db);
    if (!r) throw new AppError(422, 'FX_RATE_MISSING', `${date} uchun USD kursi topilmadi. Moliya → Kurslar bo'limida kiriting yoki CBU'dan yuklang.`);
    return r;
  }

  async list(limit = 60) {
    const rows = await this.db.fxRate.findMany({
      where: { base: 'USD', quote: 'UZS' }, orderBy: [{ effectiveDate: 'desc' }, { source: 'asc' }], take: limit,
      include: { createdBy: { select: { fullName: true } } },
    });
    return rows.map((r) => ({
      id: r.id, source: r.source, date: fromDbDate(r.effectiveDate)!, rate: rateToString(parseRate(r.rate.toString())),
      createdBy: r.createdBy?.fullName ?? null, fetchedAt: r.fetchedAt.toISOString(),
    }));
  }

  async addManual(date: string, rate: string, userId: string) {
    const exists = await this.db.fxRate.findUnique({ where: { source_base_quote_effectiveDate: { source: 'MANUAL', base: 'USD', quote: 'UZS', effectiveDate: dbDate(date) } } });
    if (exists) throw conflict("Bu sana uchun qo'lda kiritilgan kurs bor");
    const r = await this.db.fxRate.create({
      data: { source: 'MANUAL', base: 'USD', quote: 'UZS', effectiveDate: dbDate(date), rate: rateToString(parseRate(rate)), createdById: userId },
    });
    await this.audit.record(this.db, { action: 'fx.manual_rate_added', resourceType: 'fx_rate', resourceId: r.id, metadata: { date, rate } });
    return { id: r.id };
  }

  /** CBU (O'zbekiston Markaziy banki) — USD kursi. Tarmoq bo'lmasa xato qaytaradi (cron qayta urinadi). */
  async fetchCbu(date: string): Promise<{ inserted: boolean; date: string; rate: string }> {
    const url = `${env.CBU_RATES_URL.replace(/\/?$/, '/')}USD/${date}/`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new AppError(502, 'CBU_UNAVAILABLE', `CBU javobi: HTTP ${res.status}`);
    const data = (await res.json()) as { Ccy?: string; Rate?: string; Nominal?: string; Date?: string }[];
    const row = Array.isArray(data) ? data.find((x) => x.Ccy === 'USD') : undefined;
    if (!row?.Rate || !row.Date) throw new AppError(502, 'CBU_BAD_RESPONSE', "CBU javobi tushunarsiz");
    const [d, m, y] = row.Date.split('.');
    const effective = `${y}-${m}-${d}`;
    const scaled = (parseRate(row.Rate) * 1n) / BigInt(Number(row.Nominal ?? '1') || 1);
    const created = await this.db.fxRate.createMany({
      data: [{ source: 'CBU', base: 'USD', quote: 'UZS', effectiveDate: dbDate(effective), rate: rateToString(scaled), rawPayload: row as object }],
      skipDuplicates: true,
    });
    if (created.count) this.log.log(`CBU USD ${effective}: ${rateToString(scaled)}`);
    return { inserted: created.count > 0, date: effective, rate: rateToString(scaled) };
  }
}
