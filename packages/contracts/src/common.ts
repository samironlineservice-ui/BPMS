import { z } from 'zod';

/** RFC 9457 Problem Details */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
  requestId?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  sort: z.string().max(50).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const uuid = z.uuid();
export const moneyString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Summa formati: 1250000.50");
export const rateString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Kurs formati: 12100.50');
export const dateString = z.iso.date();
export const currency = z.enum(['UZS', 'USD']);
