// Sana yordamchilari. Biznes sanalari (billing davri, muddat) — kompaniya vaqt zonasida (Asia/Tashkent),
// "YYYY-MM-DD" string sifatida; DB @db.Date ustunlari UTC yarim tunidagi Date bilan yoziladi.
import { env } from '../config/env.js';

export const TZ = env.TZ_COMPANY;

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Instant → kompaniya vaqt zonasidagi sana. */
export const localDate = (d: Date = new Date()): string => fmt.format(d);
let todayOverride: string | null = null;
/** FAQAT seed/test uchun: "bugun"ni vaqtincha almashtirish (demo tarixini simulyatsiya qilish). */
export const setTodayOverride = (date: string | null) => { todayOverride = date; };
export const todayLocal = (): string => todayOverride ?? localDate(new Date());

/** "YYYY-MM-DD" → @db.Date uchun Date (UTC yarim tun). */
export const dbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
/** @db.Date → "YYYY-MM-DD". */
export const fromDbDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime()) / 60000;
}
/** Kompaniya vaqtidagi kun boshi (00:00) → UTC instant (revision validFrom va h.k.). */
export function dayStart(date: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000);
}

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => { const [y, m, d] = parts(date); return iso(y, m, d + n); };
export const addMonths = (date: string, n: number) => { const [y, m, d] = parts(date); return iso(y, m + n, d); };
export const monthStart = (date: string) => { const [y, m] = parts(date); return iso(y, m, 1); };
export const nextMonthStart = (date: string) => { const [y, m] = parts(date); return iso(y, m + 1, 1); };
export const monthEnd = (date: string) => addDays(nextMonthStart(date), -1);
export const daysInMonth = (date: string) => { const [y, m] = parts(date); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const diffDays = (from: string, to: string) => Math.round((dbDate(to).getTime() - dbDate(from).getTime()) / 86_400_000);
export const isMonthStart = (date: string) => date.endsWith('-01');
export const yearOf = (date: string) => Number(date.slice(0, 4));

/** "Hozir" (instant): override bo'lsa — o'sha kunning tushi (kompaniya vaqtida), aks holda haqiqiy vaqt. */
export const nowInstant = (): Date => (todayOverride ? new Date(dayStart(todayOverride).getTime() + 12 * 3_600_000) : new Date());
