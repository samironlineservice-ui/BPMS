import { queryOptions } from '@tanstack/react-query';
import type { CatalogProject, PayMethodsDto, PaymentCardDto, PayStartResult } from '@ads/contracts';
import { api } from './api';

export const payMethodsQuery = queryOptions({ queryKey: ['pay', 'methods'], queryFn: () => api.get<PayMethodsDto>('/pay/methods'), staleTime: 60_000 });
export const cardsQuery = queryOptions({ queryKey: ['cards'], queryFn: () => api.get<PaymentCardDto[]>('/cards') });
export const catalogQuery = queryOptions({ queryKey: ['catalog'], queryFn: () => api.get<CatalogProject[]>('/catalog') });

export const PER_INTERVAL: Record<number, string> = { 1: 'oyiga', 3: 'chorakka', 6: 'yarim yilga', 12: 'yiliga' };
export const PROVIDER_HINT: Record<string, string> = {
  PAYME: "Payme sahifasida karta bilan to'lash",
  CLICK: "Click sahifasida karta yoki Click hamyoni bilan",
  UZUM: "Uzum Bank ilovasi yoki karta bilan",
  PAYNET: 'Paynet terminali yoki ilovasi',
};
export const CARD_TYPE: Record<string, string> = { UZCARD: 'Uzcard', HUMO: 'Humo', VISA: 'Visa', MASTERCARD: 'Mastercard' };

/** Tanlangan to'lov usuli: provayder sahifasi yoki saqlangan karta. */
export type PayChoice = { method: 'PAYME' | 'CLICK' | 'UZUM' } | { method: 'CARD'; cardId: string };
export const choiceBody = (c: PayChoice) => (c.method === 'CARD' ? { method: 'CARD' as const, cardId: c.cardId } : { method: c.method });

/**
 * To'lovni boshlagandan keyin: provayder sahifasiga o'tish (tashqi — to'liq sahifa),
 * o'zimizning /pay/... sahifalari (emulyator, natija) — SPA ichida (origin farq qilsa ham sessiya yo'qolmaydi).
 */
export function openPayment(r: PayStartResult, push: (path: string) => void) {
  if (!r.redirectUrl) return push(`/pay/result/${r.orderId}`);
  const u = new URL(r.redirectUrl, window.location.href);
  if (u.pathname.startsWith('/pay/')) return push(`${u.pathname}${u.search}`);
  window.location.assign(u.toString());
}
