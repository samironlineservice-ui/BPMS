import { z } from 'zod';
import { listQuerySchema } from '../common.js';

// ── Mijoz murojaatlari ──
export const requestCategoryEnum = z.enum(['SUPPORT', 'CHANGE', 'BILLING', 'DEVICE', 'OTHER']);
export const requestStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
const messageBody = z.string().trim().min(1, 'Matn kiriting').max(5000, 'Ko\'pi bilan 5000 belgi');

export const requestCreateSchema = z.object({
  category: requestCategoryEnum,
  subject: z.string().trim().min(3, 'Kamida 3 belgi').max(200),
  body: messageBody,
  subscriptionId: z.uuid().optional().nullable(),
  deviceId: z.uuid().optional().nullable(),
});
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
/** Xodim mijoz nomidan ochadi (masalan, telefon qo'ng'irog'idan keyin). */
export const staffRequestCreateSchema = requestCreateSchema.extend({ clientId: z.uuid() });
export type StaffRequestCreateInput = z.infer<typeof staffRequestCreateSchema>;
/** internal — faqat xodimlar uchun (ichki izoh mijozga ko'rinmaydi). */
export const requestMessageSchema = z.object({ body: messageBody, internal: z.boolean().optional() });
export type RequestMessageInput = z.infer<typeof requestMessageSchema>;
export const requestStatusSchema = z.object({ status: requestStatusEnum });
export const requestAssignSchema = z.object({ assigneeId: z.uuid().nullable() });
export const requestListQuerySchema = listQuerySchema.extend({
  status: z.enum(['active', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'all']).optional(),
  clientId: z.uuid().optional(),
  mine: z.enum(['true', 'false']).optional(),
});
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;

export interface RequestMessageDto { id: string; author: 'CLIENT' | 'STAFF'; authorName: string; body: string; internal: boolean; createdAt: string }
export interface RequestRefs { subscription: { id: string; code: string; projectName: string } | null; device: { id: string; code: string; name: string } | null }
export interface RequestListItem {
  id: string; code: string; client: { id: string; name: string }; category: string; subject: string; status: string;
  lastMessageAt: string; lastMessageBy: 'CLIENT' | 'STAFF'; unread: boolean; assignee: { id: string; name: string } | null; createdAt: string;
}
export interface RequestDetail extends RequestListItem, RequestRefs {
  createdBy: string; closedAt: string | null; rowVersion: number; messages: RequestMessageDto[];
}
export interface PortalRequestItem {
  id: string; code: string; category: string; subject: string; status: string; lastMessageAt: string; lastMessageBy: 'CLIENT' | 'STAFF';
  unread: boolean; createdAt: string; createdBy: string;
}
export interface PortalRequestDetail extends PortalRequestItem, RequestRefs { closedAt: string | null; messages: RequestMessageDto[] }

export const REQUEST_CATEGORY_LABELS: Record<string, string> = {
  SUPPORT: 'Texnik yordam', CHANGE: "Ulanish yoki o'zgartirish", BILLING: "To'lov va hisob-kitob", DEVICE: 'Qurilma', OTHER: 'Boshqa',
};
export const REQUEST_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Yangi', IN_PROGRESS: "Ko'rib chiqilmoqda", RESOLVED: 'Hal qilindi', CLOSED: 'Yopilgan',
};
