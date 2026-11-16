import { type QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import type { PortalAccess, PortalCompany, PortalMe } from '@ads/contracts';
import { api } from './api';

export const meQuery = queryOptions({ queryKey: ['me'], queryFn: () => api.get<PortalMe>('/auth/me'), staleTime: 5 * 60_000 });
export const companyQuery = queryOptions({ queryKey: ['company'], queryFn: () => api.get<PortalCompany>('/company'), staleTime: 30 * 60_000 });

export const ROLE_LABELS: Record<string, string> = { OWNER: 'Egasi', ACCOUNTANT: 'Buxgalter', TECHNICIAN: 'Texnik mutaxassis', VIEWER: 'Kuzatuvchi' };
export const ROLE_HINTS: Record<string, string> = {
  OWNER: "Barcha bo'limlar va jamoani boshqarish", ACCOUNTANT: "Moliya: invoice, to'lov, akt-sverka; murojaat yozish",
  TECHNICIAN: 'Xizmatlar, qurilmalar va murojaatlar (moliyasiz)', VIEWER: "Hammasini ko'radi, hech narsani o'zgartirmaydi",
};
export const PAYMENT_METHODS: Record<string, string> = {
  BANK_TRANSFER: "Bank o'tkazmasi", CASH: 'Naqd', CARD_TERMINAL: 'Karta (terminal)', PAYME: 'Payme', CLICK: 'Click', UZUM: 'Uzum Bank', PAYNET: 'Paynet',
};
export const CHANGE_LABELS: Record<string, string> = {
  CREATED: 'Obuna boshlandi', PLAN_CHANGE: "Tarif o'zgardi", QUANTITY_CHANGE: "Miqdor o'zgardi", PRICE_CHANGE: "Narx o'zgardi", STATUS_CHANGE: "Holat o'zgardi",
};

const NONE: PortalAccess = { finance: false, writeRequests: false, team: false, pay: false };
/** UI uchun (yashirish); haqiqiy tekshiruv serverda. */
export function useAccess(): PortalAccess {
  const { data } = useQuery(meQuery);
  return data?.access ?? NONE;
}
/** Route himoyasi: ruxsat bo'lmasa bosh sahifaga. */
export const requireAccess = (key: keyof PortalAccess) => async ({ context }: { context: { queryClient: QueryClient } }) => {
  const me = await context.queryClient.ensureQueryData(meQuery);
  if (!me.access[key]) throw redirect({ to: '/' });
};
