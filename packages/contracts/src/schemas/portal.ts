import { z } from 'zod';

export const portalRoleEnum = z.enum(['OWNER', 'ACCOUNTANT', 'TECHNICIAN', 'VIEWER']);
export const portalUserInviteSchema = z.object({
  email: z.email().trim().toLowerCase(),
  fullName: z.string().trim().min(2).max(120),
  portalRole: portalRoleEnum.default('VIEWER'),
  contactId: z.uuid().optional().nullable(),
});
export type PortalUserInviteInput = z.infer<typeof portalUserInviteSchema>;
export const portalLoginSchema = z.object({ email: z.email().trim().toLowerCase(), password: z.string().min(1).max(200) });

/** Mijozning o'zi ro'yxatdan o'tishi: yangi "lid" mijoz + egasi (OWNER). Mavjud kompaniyaga ulanish — faqat menejer taklifi orqali. */
export const portalRegisterSchema = z.object({
  type: z.enum(['COMPANY', 'INDIVIDUAL']),
  companyName: z.string().trim().max(200).optional().nullable(),
  tin: z.string().trim().regex(/^\d{9}$/, 'STIR 9 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  fullName: z.string().trim().min(2, 'Ism familiyani kiriting').max(120),
  position: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{8,19}$/, "Telefon raqamini to'g'ri kiriting (masalan, +998 90 123 45 67)"),
  email: z.email("Email noto'g'ri").trim().toLowerCase(),
  password: z.string().min(12, 'Kamida 12 belgi').max(200),
  message: z.string().trim().max(2000).optional().nullable(),
  consent: z.boolean().refine((v) => v === true, { message: "Shaxsga doir ma'lumotlarni qayta ishlashga rozilik kerak" }),
  /** Botlarga qarshi yashirin maydon: odam uni ko'rmaydi va to'ldirmaydi. */
  website: z.string().max(0, "So'rov rad etildi").optional(),
}).superRefine((v, ctx) => {
  if (v.type === 'COMPANY' && (!v.companyName || v.companyName.length < 2)) ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Kompaniya nomini kiriting' });
});
export type PortalRegisterInput = z.infer<typeof portalRegisterSchema>;
export interface PortalAuthConfig { registration: boolean }

export interface PortalUserDto { id: string; email: string; fullName: string; role: string; status: string; lastLoginAt: string | null; createdAt: string }
/** Kabinet rollari: OWNER — hammasi + jamoa; ACCOUNTANT — moliya; TECHNICIAN — moliyasiz (narxlarsiz); VIEWER — faqat ko'rish. */
export interface PortalAccess { finance: boolean; writeRequests: boolean; team: boolean; /** Onlayn to'lash, obuna sotib olish, kartalar */ pay: boolean }
export interface PortalMe {
  user: { id: string; email: string; fullName: string; role: string };
  client: { id: string; code: string; name: string; legalName: string; accountNo: string; billingCurrency: string };
  access: PortalAccess;
}
export interface PortalCompany {
  name: string | null; legalName: string | null; tin: string | null; address: string | null; bankName: string | null; bankMfo: string | null;
  bankAccount: string | null; phone: string | null; email: string | null;
}
export interface PortalDashboard {
  /** Bosh sahifa banneri: OK — hammasi joyida; DUE — to'lov kutilmoqda; OVERDUE — muddati o'tgan; SUSPENDED — xizmat to'xtatilgan. */
  status: 'OK' | 'DUE' | 'OVERDUE' | 'SUSPENDED';
  finance: {
    balances: { currency: string; receivableMinor: string; overdueMinor: string; creditMinor: string; openInvoices: number }[];
    monthly: { currency: string; amountMinor: string }[];
    nextCharge: { date: string; amounts: { currency: string; amountMinor: string }[] } | null;
    history: { month: string; currency: string; invoicedMinor: string; paidMinor: string; outstandingMinor: string }[];
    openInvoices: PortalInvoice[];
    recentPayments: { id: string; code: string; method: string; currency: string; amountMinor: string; receivedAt: string }[];
  } | null;
  services: {
    id: string; code: string; projectName: string; status: string; currency: string; mrrMinor: string | null; nextBillingOn: string | null;
    trialEndsOn: string | null; cancelAtPeriodEnd: boolean; pendingChangeOn: string | null;
  }[];
  devices: { total: number; updatesAvailable: number };
  requests: { open: number; unread: number };
}
export interface PortalSummary {
  balances: { currency: string; receivableMinor: string; overdueMinor: string; creditMinor: string; openInvoices: number }[];
  subscriptions: number; devices: number; lastPayment: { code: string; amountMinor: string; currency: string; receivedAt: string } | null;
}
export interface PortalInvoice {
  id: string; number: string | null; kind: string; status: string; currency: string; totalMinor: string; paidMinor: string; creditedMinor: string;
  outstandingMinor: string; issueDate: string | null; dueDate: string | null; periodStart: string | null; periodEnd: string | null; overdueDays: number;
}
export interface PortalInvoiceDetail extends PortalInvoice {
  subtotalMinor: string; vatMinor: string; fxRate: string | null; totalUzsMinor: string | null;
  lines: { position: number; description: string; quantity: number; unitAmountMinor: string; amountMinor: string; vatMinor: string; prorationNum: number; prorationDen: number }[];
  payments: { code: string; amountMinor: string; currency: string; appliedAt: string }[];
}
export interface PortalPayment {
  id: string; code: string; method: string; currency: string; amountMinor: string; receivedAt: string; externalRef: string | null;
  unallocatedMinor: string; allocations: { invoiceId: string; invoiceNumber: string | null; amountMinor: string; currency: string }[];
}
/** Narxlar (…Minor) TECHNICIAN roli uchun null. */
export interface PortalSubscription {
  id: string; code: string; projectName: string; status: string; currency: string; mrrMinor: string | null; nextBillingOn: string | null;
  currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
  trialEndsOn: string | null; pendingChangeOn: string | null; paymentTermsDays: number;
  items: { planName: string; quantity: number; unitAmountMinor: string | null; discountBp: number; intervalMonths: number }[];
}
export interface PortalSubscriptionDetail extends PortalSubscription {
  startedOn: string | null;
  pendingChange: {
    effectiveOn: string; changeType: string; mrrMinor: string | null;
    items: { planName: string; quantity: number; unitAmountMinor: string | null; discountBp: number }[];
  } | null;
  history: { date: string; changeType: string; status: string; mrrMinor: string | null }[];
  invoices: PortalInvoice[] | null;
  installations: {
    deviceId: string; deviceCode: string; deviceName: string; siteName: string | null; componentName: string;
    currentVersion: string | null; latestVersion: string | null; updateAvailable: boolean;
  }[];
}
export interface PortalDevice {
  id: string; code: string; name: string; deviceClass: string; platform: string; status: string; siteName: string | null;
  installations: {
    componentName: string; projectName: string; currentVersion: string | null; status: string;
    latestVersion: string | null; updateAvailable: boolean; lastUpdatedAt: string | null;
  }[];
}
export const portalTeamInviteSchema = portalUserInviteSchema.omit({ contactId: true });
export type PortalTeamInviteInput = z.infer<typeof portalTeamInviteSchema>;
export interface PortalTeamMember extends PortalUserDto { isMe: boolean }
