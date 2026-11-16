import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { uz } from 'date-fns/locale';
import { formatMoney as fm, type CurrencyCode } from '@ads/contracts';

export const money = (minor: string | number | bigint | null | undefined, currency: string = 'UZS') =>
  minor === null || minor === undefined ? '—' : fm(minor as string, currency as CurrencyCode);

const toDate = (d: string | Date) => (typeof d === 'string' ? parseISO(d) : d);
export const date = (d?: string | Date | null) => (d ? format(toDate(d), 'dd.MM.yyyy') : '—');
export const dateTime = (d?: string | Date | null) => (d ? format(toDate(d), 'dd.MM.yyyy HH:mm') : '—');
/** Davr: boshlanish – tugash (DB'da tugash sanasi ochiq chegara — ko'rsatishda bir kun oldingisi). */
export const periodRange = (start?: string | null, endExclusive?: string | null) => {
  if (!start || !endExclusive) return '—';
  const end = new Date(`${endExclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${date(start)} – ${date(end.toISOString().slice(0, 10))}`;
};
/** Nisbiy vaqt o'zbekcha: "4 minut oldin", "3 kun oldin". */
export const ago = (d?: string | Date | null) => (d ? formatDistanceToNow(toDate(d), { addSuffix: true, locale: uz }) : '—');

export const bytes = (n: string | number | bigint | null | undefined) => {
  if (n === null || n === undefined) return '—';
  let v = Number(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};
