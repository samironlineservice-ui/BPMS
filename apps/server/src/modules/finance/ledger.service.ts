import { Injectable } from '@nestjs/common';
import type { Currency } from '@ads/db';
import type { DbOrTx } from '../../platform/db.service.js';
import { dbDate, monthStart } from '../../platform/time.js';

export interface PostLine {
  account: string; currency: Currency; amountMinor: bigint; amountUzsMinor: bigint; clientId?: string | null; projectId?: string | null;
}
export interface PostEntry { key: string; date: string; sourceType: string; sourceId: string; description?: string; lines: PostLine[] }

/** Double-entry sub-ledger: har biznes hodisa bilan BITTA tranzaksiyada. Debit > 0, kredit < 0; Σ UZS = 0. */
@Injectable()
export class LedgerService {
  /** Davr yozuvi yo'q bo'lsa — ochiq davr yaratiladi; yopilgan davrga yozish DB trigger'i bilan rad etiladi. */
  async ensurePeriod(tx: DbOrTx, date: string) {
    await tx.financialPeriod.createMany({ data: [{ month: dbDate(monthStart(date)) }], skipDuplicates: true });
  }

  async post(tx: DbOrTx, e: PostEntry) {
    const lines = e.lines.filter((l) => l.amountMinor !== 0n || l.amountUzsMinor !== 0n);
    if (lines.length < 2) return null;
    const sum = lines.reduce((s, l) => s + l.amountUzsMinor, 0n);
    if (sum !== 0n) throw new Error(`ledger entry ${e.key} unbalanced by ${sum}`);
    const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: e.key } });
    if (existing) return existing; // idempotent
    await this.ensurePeriod(tx, e.date);
    return tx.journalEntry.create({
      data: {
        idempotencyKey: e.key, effectiveDate: dbDate(e.date), sourceType: e.sourceType, sourceId: e.sourceId, description: e.description ?? null,
        lines: {
          create: lines.map((l) => ({
            accountCode: l.account, currency: l.currency, amountMinor: l.amountMinor, amountUzsMinor: l.amountUzsMinor,
            clientId: l.clientId ?? null, projectId: l.projectId ?? null,
          })),
        },
      },
    });
  }
}

export const ACCOUNTS = {
  CASH: '1000', BANK: '1020', CARD: '1030', AR: '1200', ADVANCES: '2100', VAT: '2200', REVENUE: '4000',
  FX_GAIN: '7100', FX_LOSS: '7200', FX_UNREALIZED_GAIN: '7150', FX_UNREALIZED_LOSS: '7250',
} as const;
/** Onlayn to'lov tizimlarining clearing hisoblari (provayder pulni keyinroq bankka o'tkazadi). */
export const CLEARING_ACCOUNTS: Record<string, string> = { PAYME: '1150', CLICK: '1151', UZUM: '1152', PAYNET: '1153' };
export const cashAccount = (method: string) =>
  CLEARING_ACCOUNTS[method] ?? (method === 'CASH' ? ACCOUNTS.CASH : method === 'CARD_TERMINAL' ? ACCOUNTS.CARD : ACCOUNTS.BANK);
