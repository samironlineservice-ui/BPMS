import crypto from 'node:crypto';
import { CLEARING_ACCOUNTS } from '../finance/ledger.service.js';

export type ProviderKey = 'PAYME' | 'CLICK' | 'UZUM' | 'PAYNET';
export const PROVIDERS: ProviderKey[] = ['PAYME', 'CLICK', 'UZUM', 'PAYNET'];

/** Har provayderning clearing hisobi (provayder pulni keyinroq bankka o'tkazadi). */
export const CLEARING_ACCOUNT = CLEARING_ACCOUNTS as Record<ProviderKey, string>;

/** Hisob identifikatori: 10–12 raqam — to'lov buyurtmasi (aniq summa); 8 raqam — mijozning shaxsiy hisob raqami (istalgan summa). */
export const ORDER_NO = /^\d{10,12}$/;
export const ACCOUNT_NO = /^\d{8}$/;
/** Shaxsiy hisobni to'ldirishda minimal summa: 1 000 so'm. */
export const MIN_TOPUP = 100_000n;

/** "1234.5" / "1234" / "1234.56" (so'm) → tiyin (float'siz). */
export function soumToTiyin(s: string | number): bigint | null {
  const v = String(s).trim();
  const m = /^(\d+)(?:\.(\d{1,2})\d*)?$/.exec(v);
  if (!m) return null;
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0');
}
/** tiyin → "1234.56" */
export const tiyinToSoum = (minor: bigint) => `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;

export function parseBasic(header: string | undefined): { user: string; pass: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  const raw = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = raw.indexOf(':');
  return i < 0 ? null : { user: raw.slice(0, i), pass: raw.slice(i + 1) };
}
export const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
export function safeEq(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');
export const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

/** Paynet/Uzum uchun "YYYY-MM-DD HH:mm:ss" (GMT+5, Toshkent). */
export function tashkentStamp(d: Date = new Date()) {
  const t = new Date(d.getTime() + 5 * 3_600_000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 19)}`;
}

/** Provayderga xos xato (handler'lar protokol formatiga o'giradi). */
export class ProviderError extends Error {
  constructor(public readonly code: number | string, message: string, public readonly data?: string) { super(message); }
}
