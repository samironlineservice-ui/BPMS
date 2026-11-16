import { queryOptions } from '@tanstack/react-query';
import type {
  ApprovalInboxItem, BillingRunDto, ClientBalance, FxRateDto, InvoiceDetail, InvoiceListItem, Paginated, PaymentDetail, PaymentListItem, PeriodDto, PlanItem,
  StatementDto, SubscriptionDetail, SubscriptionListItem, TrialBalanceRow,
} from '@ads/contracts';
import { api } from '@/lib/api';

type Q = Record<string, string | number | boolean | undefined>;
export const plansQuery = (projectId?: string) => queryOptions({ queryKey: ['plans', projectId ?? 'all'], queryFn: () => api.get<PlanItem[]>('/plans', { projectId }) });
export const subscriptionsQuery = (q: Q) => queryOptions({ queryKey: ['subscriptions', 'list', q], queryFn: () => api.get<Paginated<SubscriptionListItem>>('/subscriptions', { pageSize: 20, ...q }) });
export const subscriptionQuery = (id: string) => queryOptions({ queryKey: ['subscriptions', id], queryFn: () => api.get<SubscriptionDetail>(`/subscriptions/${id}`) });
export const invoicesQuery = (q: Q) => queryOptions({ queryKey: ['invoices', 'list', q], queryFn: () => api.get<Paginated<InvoiceListItem>>('/invoices', { pageSize: 20, ...q }) });
export const invoiceQuery = (id: string) => queryOptions({ queryKey: ['invoices', id], queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}`) });
export const paymentsQuery = (q: Q) => queryOptions({ queryKey: ['payments', 'list', q], queryFn: () => api.get<Paginated<PaymentListItem>>('/payments', { pageSize: 20, ...q }) });
export const paymentQuery = (id: string) => queryOptions({ queryKey: ['payments', id], queryFn: () => api.get<PaymentDetail>(`/payments/${id}`) });
export const balanceQuery = (clientId: string) => queryOptions({ queryKey: ['balance', clientId], queryFn: () => api.get<ClientBalance[]>(`/billing/clients/${clientId}/balance`) });
export const inboxQuery = queryOptions({ queryKey: ['approvals', 'inbox'], queryFn: () => api.get<ApprovalInboxItem[]>('/approvals/inbox'), refetchInterval: 60_000 });
export const fxRatesQuery = queryOptions({ queryKey: ['fx'], queryFn: () => api.get<FxRateDto[]>('/finance/fx-rates') });
export const periodsQuery = queryOptions({ queryKey: ['periods'], queryFn: () => api.get<PeriodDto[]>('/finance/periods') });
export const trialBalanceQuery = (asOf?: string) => queryOptions({ queryKey: ['trial-balance', asOf], queryFn: () => api.get<TrialBalanceRow[]>('/finance/trial-balance', { asOf }) });
export const statementQuery = (q: { clientId: string; currency: string; from: string; to: string }) =>
  queryOptions({ queryKey: ['statement', q], queryFn: () => api.get<StatementDto>('/finance/statement', q) });
export const runsQuery = queryOptions({ queryKey: ['billing-runs'], queryFn: () => api.get<BillingRunDto[]>('/billing/runs') });

/** Pul bilan bog'liq har qanday o'zgarishdan keyin yangilanadigan so'rovlar. */
export const MONEY_KEYS = [['invoices'], ['payments'], ['subscriptions'], ['balance'], ['approvals'], ['statement'], ['trial-balance'], ['clients']];

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd', BANK_TRANSFER: "Bank o'tkazmasi", CARD_TERMINAL: 'Karta terminali', PAYME: 'Payme', CLICK: 'Click', UZUM: 'Uzum Bank', PAYNET: 'Paynet',
};
export const KIND_LABELS: Record<string, string> = { RECURRING: 'Oylik', PRORATION: 'Qayta hisob', ONE_TIME: 'Bir martalik' };
export const CHANGE_LABELS: Record<string, string> = {
  CREATED: 'Yaratildi', PLAN_CHANGE: "Tarif o'zgardi", QUANTITY_CHANGE: "Miqdor o'zgardi", PRICE_CHANGE: "Narx o'zgardi", STATUS_CHANGE: "Holat o'zgardi",
};
export const SUB_STATUSES = [
  ['TRIALING', 'Sinov'], ['ACTIVE', 'Faol'], ['PAST_DUE', "Muddati o'tgan"], ['SUSPENDED', "To'xtatilgan"], ['CANCELLED', 'Bekor qilingan'], ['EXPIRED', 'Tugagan'],
] as const;
export const INVOICE_STATUSES = [['OPEN', "To'lanmagan"], ['PAID', "To'langan"], ['VOID', 'Bekor (void)'], ['UNCOLLECTIBLE', 'Undirilmaydigan']] as const;
export const PAYMENT_STATUSES = [['PENDING_APPROVAL', 'Tasdiq kutilmoqda'], ['POSTED', 'Tasdiqlangan'], ['REJECTED', 'Rad etilgan']] as const;
export const INTERVAL_LABELS: Record<number, string> = { 1: 'oylik', 3: 'choraklik', 6: 'yarim yillik', 12: 'yillik' };

/** "1250000.50" ↔ minor: forma qiymatlari uchun. */
export const minorToInput = (minor: string | number | bigint) => {
  const v = BigInt(minor); const neg = v < 0n; const a = neg ? -v : v;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
