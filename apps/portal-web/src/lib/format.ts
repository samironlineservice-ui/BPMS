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

/** O'qda qisqa summa: 1,5 mln / 820 ming / $1,2k */
export function compactMoney(minor: number | string, currency = 'UZS'): string {
  const v = Number(minor) / 100;
  const f = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  if (currency === 'USD') return Math.abs(v) >= 1000 ? `$${f(v / 1000)}k` : `$${Math.round(v)}`;
  if (Math.abs(v) >= 1e9) return `${f(v / 1e9)} mlrd`;
  if (Math.abs(v) >= 1e6) return `${f(v / 1e6)} mln`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} ming`;
  return String(Math.round(v));
}
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
export const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const monthShort = (iso: string) => `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
/** Bugungi sana Toshkent vaqtida (YYYY-MM-DD). */
export const todayTashkent = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
/** Necha kun qoldi (manfiy — o'tib ketgan). */
export const daysUntil = (iso: string | null | undefined) =>
  (iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayTashkent()}T00:00:00Z`)) / 86_400_000) : null);
