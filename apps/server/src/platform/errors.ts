import { isProd } from '../config/env.js';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ProblemDetails } from '@ads/contracts';

/** Biznes xatosi — Problem Details sifatida qaytadi. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export const notFound = (what = 'Yozuv') => new AppError(404, 'NOT_FOUND', `${what} topilmadi`);
export const forbidden = (msg = "Bu amal uchun ruxsat yo'q") => new AppError(403, 'FORBIDDEN', msg);
export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, code, msg);
export const badRequest = (msg: string, code = 'BAD_REQUEST') => new AppError(400, code, msg);
export const staleVersion = () =>
  new AppError(409, 'STALE_VERSION', "Yozuv boshqa foydalanuvchi tomonidan o'zgartirilgan. Sahifani yangilang.");

/** PostgreSQL SQLSTATE → HTTP (Prisma driver adapter xatosi ichidan). */
/** DB constraint/trigger xabarlari → foydalanuvchiga tushunarli matn (asl matn `detail` da qoladi). */
const DB_MESSAGES: [RegExp, string][] = [
  [/client_projects_dates_ck/, "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas"],
  [/clients_tin/, 'Bu STIR bilan faol mijoz allaqachon mavjud'],
  [/clients_pinfl/, 'Bu JSHSHIR bilan faol mijoz allaqachon mavjud'],
  [/clients_ck/, "Mijoz rekvizitlari formati noto'g'ri (STIR, MFO, hisob raqami)"],
  [/users_email|users_email_key/, 'Bu email bilan foydalanuvchi allaqachon mavjud'],
  [/folders_name_active_uq/, 'Bu papkada shunday nomli papka bor'],
  [/payments_manual_ref_uq/, "Bu hujjat raqami bilan to'lov allaqachon kiritilgan"],
  [/invoices_one_recurring_per_period_uq/, 'Bu davr uchun invoice allaqachon chiqarilgan'],
  [/plan_prices_no_overlap/, "Narx amal qilish davri boshqa narx bilan ustma-ust tushmoqda"],
  [/subscription_revisions_no_overlap/, 'Obuna shartlari davrlari ustma-ust tushmoqda'],
  [/subscriptions_.*live|subscriptions_one/, 'Bu mijoz–loyiha uchun faol obuna allaqachon bor'],
  [/separation of duties/, "So'rov muallifi o'z so'rovini tasdiqlay olmaydi"],
  [/lacks [a-z_]+:approve|lacks the approver permission/, "Tasdiqlash uchun ruxsatingiz yo'q"],
  [/financial period .*(closed|not opened)/, 'Moliyaviy davr yopilgan yoki ochilmagan'],
  [/is finalized; use a credit note|lines of invoice .* are frozen/, "Yakunlangan invoice'ni o'zgartirib bo'lmaydi — credit note yarating"],
  [/illegal subscription transition/, "Obuna holatini bunday o'zgartirib bo'lmaydi"],
  [/is not allocatable/, "Bu invoice'ga to'lov taqsimlab bo'lmaydi (holati mos emas)"],
  [/payment .* is not POSTED/, "To'lov hali tasdiqlanmagan"],
  [/payments_amounts_ck|allocations_ck/, "Taqsimlangan summa to'lov summasidan oshib ketadi"],
  [/invoices_amounts_ck/, "To'langan summa invoice summasidan oshib ketadi"],
  [/approval request .* is not pending/, "So'rov allaqachon ko'rib chiqilgan"],
  [/append-only/, "Bu yozuvni o'zgartirib yoki o'chirib bo'lmaydi (faqat qo'shiladi)"],
  [/journal entry .* unbalanced/, 'Buxgalteriya yozuvi balanslanmagan'],
];
const friendly = (msg: string) => DB_MESSAGES.find(([re]) => re.test(msg))?.[1];

function fromDatabase(err: unknown): AppError | null {
  const e = err as { code?: string; meta?: Record<string, unknown>; message?: string };
  if (!e || typeof e !== 'object') return null;
  const cause = (e.meta?.driverAdapterError as { cause?: { code?: string; originalMessage?: string; constraint?: unknown } })?.cause;
  const sqlState = cause?.code ?? (/Code: `(\w{5})`/.exec(e.message ?? '')?.[1] ?? undefined);
  const dbMsg = cause?.originalMessage ?? /Message: `([^`]+)`/.exec(e.message ?? '')?.[1] ?? '';
  if (e.code === 'P2025') return notFound();
  const nice = friendly(`${dbMsg} ${e.message ?? ''}`);
  const withDetail = (a: AppError) => Object.assign(a, { detail: dbMsg || undefined });
  if (e.code === 'P2002' || sqlState === '23505') return withDetail(conflict(nice ?? 'Bunday yozuv allaqachon mavjud', 'DUPLICATE'));
  if (e.code === 'P2003' || sqlState === '23503') return withDetail(new AppError(409, 'FOREIGN_KEY', nice ?? "Bog'liq yozuv topilmadi yoki mos emas"));
  if (!sqlState) return null;
  if (sqlState === '42501') return new AppError(403, 'DB_PERMISSION', dbMsg || "Ruxsat yo'q");
  if (sqlState === '23514' || sqlState === '23000' || sqlState === '23P01' || sqlState === '23502' || sqlState === 'P0001')
    return withDetail(new AppError(422, 'INTEGRITY_RULE', nice ?? "Ma'lumotlar yaxlitligi qoidasi buzildi"));
  if (sqlState === '40001' || sqlState === '40P01') return new AppError(409, 'RETRY', 'Parallel o\'zgarish — qayta urinib ko\'ring');
  return null;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    let body: ProblemDetails;

    const dbErr = exception instanceof AppError ? null : fromDatabase(exception);
    const appErr = exception instanceof AppError ? exception : dbErr;
    if (appErr) {
      const detail = (appErr as AppError & { detail?: string }).detail;
      body = { type: 'about:blank', title: appErr.message, status: appErr.status, code: appErr.code, errors: appErr.errors, ...(detail && !isProd ? { detail } : {}) };
    } else if (exception instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      for (const i of exception.issues) (errors[i.path.join('.') || '_'] ??= []).push(i.message);
      body = { type: 'about:blank', title: "So'rov ma'lumotlari noto'g'ri", status: 400, code: 'VALIDATION', errors };
    } else if (exception instanceof HttpException) {
      const r = exception.getResponse();
      const title = typeof r === 'string' ? r : ((r as { message?: string | string[] }).message?.toString() ?? exception.message);
      body = { type: 'about:blank', title, status: exception.getStatus(), code: 'HTTP' };
    } else {
      this.log.error(exception instanceof Error ? exception.stack : String(exception));
      body = { type: 'about:blank', title: 'Ichki xatolik', status: 500, code: 'INTERNAL' };
    }
    body.requestId = String(req.id);
    void reply.status(body.status).header('content-type', 'application/problem+json').send(body);
  }
}
