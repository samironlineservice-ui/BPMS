import { mulDivRound } from '@ads/contracts';
import type { MrrMovementType } from '@ads/db';
import { requestContext } from '../../platform/context.js';
import { addDays, addMonths, daysInMonth, diffDays, isMonthStart, nextMonthStart } from '../../platform/time.js';

/** MRR'ga faqat shu holatlar qo'shiladi (TRIALING/SUSPENDED — yo'q). */
export const COUNTING = new Set(['ACTIVE', 'PAST_DUE']);
export const effectiveMrr = (status: string, mrr: bigint) => (COUNTING.has(status) ? mrr : 0n);
export const BILLABLE = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;

export interface ItemSpec {
  planPriceId: string; quantity: number; unitAmountMinor: bigint; discountBp: number; vatRateBp: number;
  planName: string; planCode: string; intervalMonths: number; ikpuCode: string | null; packageCode: string | null;
}

/** Oylikka normallashtirilgan, chegirmadan keyin, QQSsiz. */
export const itemMrr = (it: Pick<ItemSpec, 'quantity' | 'unitAmountMinor' | 'discountBp' | 'intervalMonths'>) =>
  mulDivRound(BigInt(it.quantity) * it.unitAmountMinor * BigInt(10000 - it.discountBp), 1n, 10000n * BigInt(it.intervalMonths));
export const revisionMrr = (items: Pick<ItemSpec, 'quantity' | 'unitAmountMinor' | 'discountBp' | 'intervalMonths'>[]) =>
  items.reduce((s, it) => s + itemMrr(it), 0n);

export function movementType(oldEff: bigint, newEff: bigint, reactivation: boolean): MrrMovementType | null {
  if (oldEff === newEff) return null;
  if (oldEff === 0n) return reactivation ? 'REACTIVATION' : 'NEW';
  if (newEff === 0n) return 'CHURN';
  return newEff > oldEff ? 'EXPANSION' : 'CONTRACTION';
}

/**
 * Billing davri: kalendar oy(lar). Oyning 1-sanasidan boshlansa — to'liq davr (interval oy),
 * aks holda keyingi oyning 1-sanasigacha kunlik proration (den = oydagi kunlar × interval).
 */
export function periodBounds(start: string, intervalMonths: number) {
  if (isMonthStart(start)) return { end: addMonths(start, intervalMonths), num: 1, den: 1, partial: false };
  const end = nextMonthStart(start);
  return { end, num: diffDays(start, end), den: daysInMonth(start) * intervalMonths, partial: true };
}

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
export function periodLabel(start: string, end: string): string {
  const last = addDays(end, -1);
  const m = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
  if (isMonthStart(start) && isMonthStart(end)) return m(start) === m(last) ? m(start) : `${m(start)} – ${m(last)}`;
  return `${dmy(start)} – ${dmy(last)}`;
}

export interface LineDraft {
  type: 'SUBSCRIPTION' | 'PRORATION' | 'ONE_TIME' | 'DISCOUNT'; description: string; planPriceId: string | null;
  periodStart: string | null; periodEnd: string | null; quantity: number; unitAmountMinor: bigint; prorationNum: number; prorationDen: number;
  amountMinor: bigint; vatRateBp: number; vatMinor: bigint; ikpuCode: string | null; packageCode: string | null;
}

/** DB CHECK bilan aynan bir xil: amount = round(qty × unit × num / den), vat = round(amount × bp / 10000). */
export function line(d: Omit<LineDraft, 'amountMinor' | 'vatMinor'>): LineDraft {
  const amountMinor = mulDivRound(BigInt(d.quantity) * d.unitAmountMinor * BigInt(d.prorationNum), 1n, BigInt(d.prorationDen));
  return { ...d, amountMinor, vatMinor: mulDivRound(amountMinor, BigInt(d.vatRateBp), 10000n) };
}

/** Tarif qatorlari (+ chegirma qatorlari). `credit` — oldingi tarifning foydalanilmagan qismi (manfiy). */
export function itemLines(items: ItemSpec[], o: {
  type: 'SUBSCRIPTION' | 'PRORATION'; num: number; den: number; periodStart: string | null; periodEnd: string | null; label: string; credit?: boolean;
}): LineDraft[] {
  const out: LineDraft[] = [];
  for (const it of items) {
    const main = line({
      type: o.credit ? 'DISCOUNT' : o.type, description: `${it.planName}${o.label}`, planPriceId: o.credit ? null : it.planPriceId,
      periodStart: o.periodStart, periodEnd: o.periodEnd, quantity: it.quantity, unitAmountMinor: o.credit ? -it.unitAmountMinor : it.unitAmountMinor,
      prorationNum: o.num, prorationDen: o.den, vatRateBp: it.vatRateBp, ikpuCode: it.ikpuCode, packageCode: it.packageCode,
    });
    out.push(main);
    if (it.discountBp > 0) {
      const disc = mulDivRound(main.amountMinor, BigInt(it.discountBp), 10000n);
      if (disc !== 0n) {
        out.push(line({
          type: 'DISCOUNT', description: `Chegirma ${it.discountBp / 100}% — ${it.planName}`, planPriceId: null, periodStart: o.periodStart, periodEnd: o.periodEnd,
          quantity: 1, unitAmountMinor: -disc, prorationNum: 1, prorationDen: 1, vatRateBp: it.vatRateBp, ikpuCode: null, packageCode: null,
        }));
      }
    }
  }
  return out;
}

export const sumLines = (lines: LineDraft[]) => {
  const subtotal = lines.reduce((s, l) => s + l.amountMinor, 0n);
  const vat = lines.reduce((s, l) => s + l.vatMinor, 0n);
  return { subtotal, vat, total: subtotal + vat };
};

/** Revision/harakatlar uchun aktor (API — xodim, cron — SYSTEM). */
export const currentActor = () => {
  const a = requestContext.get().actor;
  return { actorType: a.type as 'STAFF' | 'SYSTEM', actorId: a.type === 'STAFF' ? a.id : null };
};

export const minMax = { min: (a: bigint, b: bigint) => (a < b ? a : b), max: (a: bigint, b: bigint) => (a > b ? a : b) };
