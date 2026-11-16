import { z } from 'zod';
import { currency, dateString, moneyString, rateString } from '../common.js';

const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'kichik lotin harflar, raqam va "-" (2–40)');
/** Musbat summa (minor emas, odam yozadigan ko'rinishda: "1250000.50"). */
export const positiveMoney = moneyString.refine((v) => !v.startsWith('-') && /[1-9]/.test(v), "Summa 0 dan katta bo'lishi kerak");
const reason = z.string().trim().min(3, 'Sababni yozing').max(500);
const rowVersion = z.number().int();

// ── Tariflar ──
/** Mijoz kabinetidagi katalog: ochiq tarif mijozga ko'rinadi va uni o'zi sotib oladi (onlayn to'lov bilan). */
const catalogFields = {
  isPublic: z.boolean().default(false),
  features: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
};
export const planCreateSchema = z.object({
  projectId: z.uuid(),
  code: slug,
  name: z.string().trim().min(2).max(120),
  description: optText(1000),
  intervalMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1),
  isActive: z.boolean().default(true),
  ...catalogFields,
});
export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: optText(1000),
  isActive: z.boolean(),
  ...catalogFields,
});
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
export const planPriceCreateSchema = z.object({
  currency,
  unitAmount: moneyString.refine((v) => !v.startsWith('-'), "Manfiy bo'lmasin"),
  vatRateBp: z.number().int().min(0).max(10000).default(0),
  validFrom: dateString,
  ikpuCode: z.string().trim().regex(/^\d{17}$/, 'IKPU 17 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  packageCode: optText(30),
});
export type PlanPriceCreateInput = z.infer<typeof planPriceCreateSchema>;

// ── Obunalar ──
export const subscriptionItemSchema = z.object({
  planPriceId: z.uuid(),
  quantity: z.number().int().min(1).max(100000),
  unitAmount: moneyString.optional().nullable(), // kelishilgan narx (bo'sh — tarif narxi)
  discountBp: z.number().int().min(0).max(10000).default(0),
});
export type SubscriptionItemInput = z.infer<typeof subscriptionItemSchema>;
export const subscriptionCreateSchema = z.object({
  clientProjectId: z.uuid(),
  currency,
  items: z.array(subscriptionItemSchema).min(1).max(20),
  startDate: dateString,
  trialDays: z.number().int().min(0).max(90).default(0),
  paymentTermsDays: z.number().int().min(0).max(90).default(10),
  graceDays: z.number().int().min(0).max(90).default(15),
});
export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateSchema>;
export const subscriptionChangeSchema = z.object({
  items: z.array(subscriptionItemSchema).min(1).max(20),
  effective: z.enum(['now', 'next_period']),
  reason: optText(500),
  rowVersion,
});
export type SubscriptionChangeInput = z.infer<typeof subscriptionChangeSchema>;
export const subscriptionCancelSchema = z.object({ atPeriodEnd: z.boolean(), reason, rowVersion });
export const subscriptionReasonSchema = z.object({ reason, rowVersion });
export const subscriptionTermsSchema = z.object({
  paymentTermsDays: z.number().int().min(0).max(90), graceDays: z.number().int().min(0).max(90), rowVersion,
});

// ── Invoice'lar ──
export const oneTimeInvoiceSchema = z.object({
  clientId: z.uuid(),
  currency,
  dueDays: z.number().int().min(0).max(90).default(10),
  lines: z.array(z.object({
    description: z.string().trim().min(2).max(300),
    quantity: z.number().int().min(1).max(100000),
    unitAmount: positiveMoney,
    vatRateBp: z.number().int().min(0).max(10000).default(0),
  })).min(1).max(50),
});
export type OneTimeInvoiceInput = z.infer<typeof oneTimeInvoiceSchema>;
export const creditNoteRequestSchema = z.object({ amount: positiveMoney, reason });
export const voidRequestSchema = z.object({ reason });

// ── To'lovlar ──
export const manualPaymentMethods = ['CASH', 'BANK_TRANSFER', 'CARD_TERMINAL'] as const;
export const paymentRecordSchema = z.object({
  clientId: z.uuid(),
  method: z.enum(manualPaymentMethods),
  currency,
  amount: positiveMoney,
  receivedOn: dateString,
  externalRef: z.string().trim().max(60).optional().nullable().transform((v) => (v ? v : null)),
  notes: optText(1000),
  receiptFileId: z.uuid().optional().nullable(),
  fxRate: rateString.optional().nullable(), // USD to'lov: bo'sh bo'lsa — CBU kursi
});
export type PaymentRecordInput = z.infer<typeof paymentRecordSchema>;
export const paymentRejectSchema = z.object({ reason });
export const allocateSchema = z.object({
  items: z.array(z.object({ invoiceId: z.uuid(), amount: positiveMoney })).min(1).max(50), // invoice valyutasida
});
export type AllocateInput = z.infer<typeof allocateSchema>;
export const refundRequestSchema = z.object({ amount: positiveMoney, reason });

// ── Tasdiqlar, moliya ──
export const approvalDecisionSchema = z.object({ approve: z.boolean(), comment: z.string().trim().max(500).optional() });
export const fxRateManualSchema = z.object({ date: dateString, rate: rateString });
export const statementQuerySchema = z.object({ clientId: z.uuid(), currency, from: dateString, to: dateString });

// ── DTO'lar (summalar — minor units, string) ──
export interface Ref { id: string; code: string; name: string }
export interface PriceItem { id: string; currency: string; unitAmountMinor: string; vatRateBp: number; validFrom: string; validTo: string | null; ikpuCode: string | null; inUse: boolean }
export interface PlanItem {
  id: string; projectId: string; code: string; name: string; description: string | null; intervalMonths: number; isActive: boolean;
  isPublic: boolean; features: string[]; sortOrder: number; prices: PriceItem[];
}
export interface RevisionItemDto { planPriceId: string; planName: string; planCode: string; quantity: number; unitAmountMinor: string; discountBp: number; intervalMonths: number }
export interface RevisionDto {
  id: string; revisionNo: number; validFrom: string; validTo: string | null; status: string; mrrMinor: string;
  changeType: string; reason: string | null; items: RevisionItemDto[];
}
export interface SubscriptionListItem {
  id: string; code: string; client: Ref; project: Ref; status: string; currency: string; mrrMinor: string;
  nextBillingOn: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; createdAt: string;
}
export interface InvoiceListItem {
  id: string; number: string | null; kind: string; status: string; client: Ref; currency: string;
  totalMinor: string; paidMinor: string; creditedMinor: string; outstandingMinor: string;
  issueDate: string | null; dueDate: string | null; periodStart: string | null; periodEnd: string | null;
  subscriptionCode: string | null; overdueDays: number;
}
export interface SubscriptionDetail extends SubscriptionListItem {
  clientProjectId: string; trialEndsOn: string | null; paymentTermsDays: number; graceDays: number; pastDueSince: string | null;
  endedAt: string | null; rowVersion: number; revisions: RevisionDto[]; invoices: InvoiceListItem[];
  pendingChange: { effectiveOn: string; changeType: string; reason: string | null; items: { planPriceId: string; quantity: number; unitAmountMinor: string; discountBp: number }[] } | null;
}
export interface InvoiceLineDto {
  id: string; position: number; type: string; description: string; quantity: number; unitAmountMinor: string;
  prorationNum: number; prorationDen: number; amountMinor: string; vatRateBp: number; vatMinor: string; periodStart: string | null; periodEnd: string | null;
}
export interface AllocationDto {
  id: string; paymentId: string; paymentCode: string; invoiceId: string; invoiceNumber: string | null; paymentCurrency: string; invoiceCurrency: string;
  amountPaymentMinor: string; amountInvoiceMinor: string; fxRate: string; fxDiffUzsMinor: string; appliedAt: string; reversalOfId: string | null; reversed: boolean;
}
export interface PendingApprovalRef { id: string; policyKey: string; status: string; createdAt: string }
export interface InvoiceDetail extends InvoiceListItem {
  subtotalMinor: string; vatMinor: string; fxRate: string | null; totalUzsMinor: string | null; clientSnapshot: Record<string, unknown> | null;
  voidReason: string | null; finalizedAt: string | null; voidedAt: string | null; subscriptionId: string | null; rowVersion: number;
  lines: InvoiceLineDto[]; allocations: AllocationDto[];
  creditNotes: { id: string; number: string; amountMinor: string; vatMinor: string; reason: string; issuedAt: string }[];
  approvals: PendingApprovalRef[];
}
export interface PaymentListItem {
  id: string; code: string; client: Ref; method: string; status: string; currency: string; amountMinor: string; allocatedMinor: string;
  refundedMinor: string; unallocatedMinor: string; receivedAt: string; externalRef: string | null; createdBy: string | null; approvedBy: string | null;
}
export interface RefundDto {
  id: string; amountMinor: string; status: string; reason: string; requestedBy: string; approvedBy: string | null; createdAt: string; completedAt: string | null;
}
export interface PaymentDetail extends PaymentListItem {
  fxRate: string; amountUzsMinor: string; notes: string | null; receiptFileId: string | null; allocations: AllocationDto[]; refunds: RefundDto[];
}
export interface ClientBalance { currency: string; receivableMinor: string; overdueMinor: string; creditMinor: string; openInvoices: number }
export interface ApprovalInboxItem {
  kind: 'APPROVAL' | 'PAYMENT' | 'REFUND'; id: string; title: string; description: string; policyKey: string | null;
  amountMinor: string | null; currency: string | null; requestedBy: string; createdAt: string; resourceType: string; resourceId: string | null;
  canDecide: boolean;
}
export interface FxRateDto { id: string; source: string; date: string; rate: string; createdBy: string | null; fetchedAt: string }
export interface PeriodDto { month: string; fxRevaluedAt: string | null; closedAt: string | null; closedBy: string | null; entries: number }
export interface StatementLine { date: string; ref: string; description: string; debitMinor: string; creditMinor: string; balanceMinor: string; sourceType: string; sourceId: string }
export interface StatementDto {
  client: Ref; currency: string; from: string; to: string; openingMinor: string; closingMinor: string;
  debitTotalMinor: string; creditTotalMinor: string; lines: StatementLine[];
}
export interface TrialBalanceRow { code: string; name: string; type: string; debitUzsMinor: string; creditUzsMinor: string; balanceUzsMinor: string }
export interface BillingRunDto { id: string; runDate: string; status: string; enqueued: number; invoiced: number; failed: number; errors: unknown; startedAt: string; finishedAt: string | null }
