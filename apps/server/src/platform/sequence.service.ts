import { Injectable } from '@nestjs/common';
import type { DbOrTx } from './db.service.js';

/** Gapless raqamlash: tranzaksiya ichida chaqiriladi (rollback raqamni qaytaradi). */
@Injectable()
export class SequenceService {
  async next(db: DbOrTx, series: string, year = 0): Promise<number> {
    const rows = await db.$queryRaw<{ value: number }[]>`
      INSERT INTO document_sequences (series, year, next_value) VALUES (${series}, ${year}, 2)
      ON CONFLICT (series, year) DO UPDATE SET next_value = document_sequences.next_value + 1
      RETURNING next_value - 1 AS value`;
    return Number(rows[0]!.value);
  }
  /** CL-000042, INV-2026-000123 */
  async code(db: DbOrTx, series: string, opts: { year?: number; width?: number } = {}): Promise<string> {
    const n = await this.next(db, series, opts.year ?? 0);
    const num = String(n).padStart(opts.width ?? 6, '0');
    return opts.year ? `${series}-${opts.year}-${num}` : `${series}-${num}`;
  }
}
