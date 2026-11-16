import { z } from 'zod';

export const clientType = z.enum(['COMPANY', 'INDIVIDUAL']);
export const clientStatus = z.enum(['LEAD', 'ACTIVE', 'SUSPENDED', 'CHURNED', 'ARCHIVED']);

const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

// Default'siz maydonlar: PATCH (.partial()) yuborilmagan maydonlarga default qo'ymasligi uchun
const clientFields = {
  type: clientType,
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(1).max(120),
  tin: z.string().trim().regex(/^\d{9}$/, 'STIR 9 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  pinfl: z.string().trim().regex(/^\d{14}$/, 'JSHSHIR 14 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  vatPayer: z.boolean(),
  legalAddress: optText(300),
  region: optText(80),
  bankName: optText(120),
  bankMfo: z.string().trim().regex(/^\d{5}$/, 'MFO 5 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  bankAccount: z.string().trim().regex(/^\d{20}$/, 'Hisob raqami 20 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  billingEmail: z.email().optional().nullable().or(z.literal('').transform(() => null)),
  phone: optText(30),
  preferredLocale: z.enum(['uz', 'ru', 'en']),
  billingCurrency: z.enum(['UZS', 'USD']),
  isResident: z.boolean(),
  status: clientStatus,
  accountManagerId: z.uuid().optional().nullable().or(z.literal('').transform(() => null)),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
};
export const clientUpsertSchema = z.object({
  ...clientFields,
  vatPayer: clientFields.vatPayer.default(false),
  preferredLocale: clientFields.preferredLocale.default('uz'),
  billingCurrency: clientFields.billingCurrency.default('UZS'),
  isResident: clientFields.isResident.default(true),
  status: clientFields.status.default('LEAD'),
  tags: clientFields.tags.default([]),
});
export type ClientUpsertInput = z.infer<typeof clientUpsertSchema>;
export const clientUpdateSchema = z.object(clientFields).partial().extend({ rowVersion: z.number().int() });
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

export const contactUpsertSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  position: optText(80),
  phone: optText(30),
  email: z.email().optional().nullable().or(z.literal('').transform(() => null)),
  telegram: optText(60),
  isPrimary: z.boolean().default(false),
  isBilling: z.boolean().default(false),
});
export type ContactUpsertInput = z.infer<typeof contactUpsertSchema>;

export const siteUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: optText(300),
  region: optText(80),
  timezone: z.string().trim().max(60).default('Asia/Tashkent'),
});
export type SiteUpsertInput = z.infer<typeof siteUpsertSchema>;

export const noteCreateSchema = z.object({ body: z.string().trim().min(1).max(5000), pinned: z.boolean().default(false) });

export interface ClientListItem {
  id: string; code: string; type: string; displayName: string; legalName: string; tin: string | null; status: string;
  accountNo: string; phone: string | null; accountManager: { id: string; fullName: string } | null;
  tags: string[]; projectCount: number; createdAt: string;
}
export interface ContactItem { id: string; fullName: string; position: string | null; phone: string | null; email: string | null; telegram: string | null; isPrimary: boolean; isBilling: boolean }
export interface SiteItem { id: string; name: string; address: string | null; region: string | null; timezone: string; deviceCount: number }
export interface ClientDetail extends ClientListItem {
  pinfl: string | null; vatPayer: boolean; legalAddress: string | null; region: string | null; bankName: string | null;
  bankMfo: string | null; bankAccount: string | null; billingEmail: string | null; preferredLocale: string; billingCurrency: string;
  isResident: boolean; rowVersion: number; updatedAt: string;
  contacts: ContactItem[]; sites: SiteItem[];
  projects: { id: string; projectId: string; code: string; name: string; status: string }[];
}
export interface NoteItem { id: string; body: string; pinned: boolean; author: string; createdAt: string }
