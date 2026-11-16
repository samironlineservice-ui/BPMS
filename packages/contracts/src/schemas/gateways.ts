import { z } from 'zod';

// ── Onlayn to'lov tizimlari (Payme, Click, Uzum, Paynet) ──
export const gatewayProviderEnum = z.enum(['PAYME', 'CLICK', 'UZUM', 'PAYNET']);
export type GatewayProviderKey = z.infer<typeof gatewayProviderEnum>;
/** Checkout'da tanlanadigan usul: provayder sahifasi yoki saqlangan karta. */
export const payMethodEnum = z.enum(['PAYME', 'CLICK', 'UZUM', 'CARD']);
export const gatewayModeEnum = z.enum(['EMULATOR', 'TEST', 'PROD']);

export const GATEWAY_LABELS: Record<string, string> = { PAYME: 'Payme', CLICK: 'Click', UZUM: 'Uzum Bank', PAYNET: 'Paynet' };
export const GATEWAY_MODE_LABELS: Record<string, string> = { EMULATOR: 'Emulyator (lokal sinov)', TEST: 'Test (sandbox)', PROD: "Haqiqiy to'lovlar" };

// ── Katalog va checkout ──
const items = z.array(z.object({ planPriceId: z.uuid(), quantity: z.coerce.number().int().min(1).max(1000) })).min(1).max(10);
export const checkoutQuoteSchema = z.object({ items });
export const checkoutCreateSchema = z.object({
  items,
  method: payMethodEnum,
  cardId: z.uuid().optional().nullable(),
}).refine((v) => v.method !== 'CARD' || !!v.cardId, { message: 'Kartani tanlang', path: ['cardId'] });
export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;

export const invoicePaySchema = z.object({
  invoiceIds: z.array(z.uuid()).min(1).max(20),
  method: payMethodEnum,
  cardId: z.uuid().optional().nullable(),
}).refine((v) => v.method !== 'CARD' || !!v.cardId, { message: 'Kartani tanlang', path: ['cardId'] });
export type InvoicePayInput = z.infer<typeof invoicePaySchema>;

export interface CatalogPlan {
  planId: string; code: string; name: string; description: string | null; features: string[]; intervalMonths: number;
  prices: { planPriceId: string; currency: string; unitAmountMinor: string }[];
  /** Mijozning shu loyihada faol obunasi bor — yangisi emas, o'zgartirish so'rovi orqali */
  subscribed: boolean;
}
export interface CatalogProject { projectId: string; name: string; description: string | null; plans: CatalogPlan[] }

export interface CheckoutQuote {
  currency: string; intervalMonths: number; startDate: string;
  /** Bugun to'lanadigan summa — birinchi davr (oy oxirigacha kunlik yoki to'liq davr) */
  amountMinor: string;
  periodStart: string; periodEnd: string; partial: boolean;
  /** Keyingi hisob: sanasi va to'liq davr summasi */
  nextBillingOn: string; nextAmountMinor: string;
  lines: { description: string; quantity: number; amountMinor: string }[];
}
export interface PayStartResult {
  orderId: string; number: string; status: string;
  /** Provayder sahifasiga yo'naltirish (karta bilan to'lovda — null) */
  redirectUrl: string | null;
  checkoutId?: string | null;
}
export interface PaymentOrderStatusDto {
  id: string; number: string; purpose: string; status: string; provider: string | null; amountMinor: string | null; paidAt: string | null; failure: string | null;
  checkout: { id: string; code: string; status: string; subscriptionId: string | null } | null;
}
export interface PayMethodsDto {
  providers: { key: string; label: string; mode: string; cards: boolean }[];
  /** Shaxsiy hisob raqami: Payme/Click/Uzum ilovasida yoki Paynet terminalida shu raqam bilan to'ldiriladi */
  topup: { accountNo: string; providers: string[] };
  /** Payme karta qo'shish (cards.create front-end'dan to'g'ridan-to'g'ri Payme'ga, X-Auth: merchant id) */
  paymeCards?: { endpoint: string; merchantId: string };
  /** Emulyator rejimidagi provayderlar uchun sinov kartalari (faqat lokal muhit) */
  testCards?: { number: string; expire: string; note: string }[];
  testSmsCode?: string;
}

// ── Emulyator (faqat lokal muhit: provayder serveri o'rnida bizning webhook'larni chaqiradi) ──
export const emulatorPaySchema = z.object({
  provider: gatewayProviderEnum,
  scenario: z.enum(['pay', 'decline']).default('pay'),
  cardNumber: z.string().trim().max(32).optional(),
  expire: z.string().trim().max(8).optional(),
  smsCode: z.string().trim().max(8).optional(),
});
export type EmulatorPayInput = z.infer<typeof emulatorPaySchema>;
export const emulatorTopupSchema = emulatorPaySchema.extend({
  amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Summani so'mda kiriting"),
});
export type EmulatorTopupInput = z.infer<typeof emulatorTopupSchema>;
export interface EmulatorResult { ok: boolean; message: string; steps: { name: string; ok: boolean; detail: string }[] }

// ── Kartalar ──
/** Payme: karta front-end'da (to'g'ridan-to'g'ri Payme'ga) tokenlashtiriladi — serverga faqat token keladi. */
export const cardSaveTokenSchema = z.object({ provider: z.literal('PAYME'), token: z.string().trim().min(10).max(2000) });
/** Click: karta ma'lumoti server orqali Click'ga uzatiladi (saqlanmaydi, logga yozilmaydi). */
export const clickCardRequestSchema = z.object({
  cardNumber: z.string().trim().transform((v) => v.replace(/\D/g, '')).pipe(z.string().regex(/^\d{16}$/, "Karta raqami 16 ta raqam")),
  expire: z.string().trim().transform((v) => v.replace(/\D/g, '')).pipe(z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/, 'Amal qilish muddati: OO/YY')),
});
export const cardVerifySchema = z.object({ smsCode: z.string().trim().regex(/^\d{4,8}$/, 'SMS kodni kiriting') });
export const cardUpdateSchema = z.object({ isDefault: z.boolean().optional(), autopay: z.boolean().optional() });
export interface PaymentCardDto {
  id: string; provider: string; maskedPan: string; expire: string; cardType: string | null; status: string;
  isDefault: boolean; autopay: boolean; createdAt: string; lastUsedAt: string | null; phoneMask: string | null;
}

// ── Xodimlar: to'lov tizimlari sozlamalari ──
export const gatewayConfigSchema = z.object({
  enabled: z.boolean(),
  mode: gatewayModeEnum,
  merchantId: z.string().trim().max(200).optional().default(''),
  settings: z.record(z.string(), z.string().max(300)).optional().default({}),
  /** Bo'sh kalit — o'zgarmaydi; to'ldirilgani yangilanadi */
  secrets: z.record(z.string(), z.string().max(500)).optional().default({}),
});
export type GatewayConfigInput = z.infer<typeof gatewayConfigSchema>;
export interface GatewayConfigDto {
  provider: string; label: string; enabled: boolean; mode: string; merchantId: string; settings: Record<string, string>;
  secretKeys: string[]; callbackUrls: string[]; updatedAt: string | null;
  fields: { settings: { key: string; label: string }[]; secrets: { key: string; label: string }[] };
}
