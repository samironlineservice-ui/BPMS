import { Injectable } from '@nestjs/common';
import { Db } from '../../../platform/db.service.js';
import { CaptureService } from '../capture.service.js';
import { parseBasic, ProviderError, safeEq, tashkentStamp } from '../common.js';
import { GatewayConfigService } from '../config.service.js';
import { PaymentOrdersService } from '../orders.service.js';

/**
 * Paynet UWS v3.4 (JSON-RPC 2.0, POST /uws, Basic auth — noto'g'ri bo'lsa HTTP 401). Summa — tiyin, vaqt — "YYYY-MM-DD HH:mm:ss" (GMT+5).
 * Mijoz Paynet terminali/ilovasida shaxsiy hisob raqami (8 raqam) yoki buyurtma raqamini kiritadi.
 */
const MSG: Record<number, string> = {
  77: "Bekor qilish uchun mablag' yetarli emas (to'lov xizmatga ishlatilgan)", 102: 'Tizim xatosi', 201: 'Tranzaksiya allaqachon mavjud', 202: 'Tranzaksiya allaqachon bekor qilingan',
  203: 'Tranzaksiya topilmadi', 302: 'Mijoz topilmadi', 411: 'Majburiy parametr yo\'q', 413: "Noto'g'ri summa", 414: "Noto'g'ri sana formati", [-32601]: 'Metod topilmadi', [-32600]: "Noto'g'ri so'rov", [-32700]: 'JSON xato',
};

@Injectable()
export class PaynetService {
  constructor(private readonly db: Db, private readonly config: GatewayConfigService, private readonly orders: PaymentOrdersService, private readonly capture: CaptureService) {}

  async handle(b: { id?: unknown; method?: string; params?: Record<string, unknown> }, authHeader: string | undefined) {
    const c = await this.config.get('PAYNET');
    const cred = parseBasic(authHeader);
    const authOk = !!c.enabled && !!cred && !!c.secrets.login && safeEq(cred.user, c.secrets.login) && safeEq(cred.pass, c.secrets.password ?? '');
    if (!authOk) return { authOk, httpStatus: 401, response: { error: 'Unauthorized' } };
    const id = b?.id ?? null;
    const err = (code: number) => ({ authOk, httpStatus: 200, response: { jsonrpc: '2.0', id, error: { code, message: MSG[code] ?? 'Xato' } } });
    const ok = (result: Record<string, unknown>) => ({ authOk, httpStatus: 200, response: { jsonrpc: '2.0', id, result } });
    if ((b as { __invalidJson?: boolean })?.__invalidJson) return err(-32700);
    if (!b || typeof b.method !== 'string' || typeof b.params !== 'object' || b.params === null) return err(-32600);
    const p = b.params;
    if (p.serviceId !== undefined && String(p.serviceId) !== String(c.settings.serviceId)) return err(302);
    const fields = (p.fields ?? {}) as Record<string, unknown>;

    switch (b.method) {
      case 'GetInformation': {
        const order = await this.orders.resolve(fields.account ?? fields.clientid ?? fields.order_id);
        if (!order) return err(302);
        return ok({ status: 0, timestamp: tashkentStamp(), fields: { name: order.client.displayName, ...(order.kind === 'FIXED' ? { amount: Number(order.amountMinor) } : {}) } });
      }
      case 'PerformTransaction': {
        const trnId = String(p.transactionId ?? '');
        if (!trnId || !/^\d+$/.test(String(p.amount ?? ''))) return err(411);
        if (await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: 'PAYNET', externalId: trnId } } })) return err(201);
        const order = await this.orders.resolve(fields.account ?? fields.clientid ?? fields.order_id);
        if (!order) return err(302);
        const amount = BigInt(String(p.amount));
        const why = this.orders.payable(order, amount);
        if (why === 'AMOUNT') return err(413);
        if (why) return err(201);
        let g;
        try {
          g = await this.capture.createSucceeded({ provider: 'PAYNET', externalId: trnId, orderId: order.id, orderKind: order.kind, amountMinor: amount, providerTime: new Date() });
        } catch (e) {
          if (e instanceof ProviderError && e.code === 'BUSY') return err(201);
          throw e;
        }
        return ok({ providerTrnId: Number(g.seq), timestamp: tashkentStamp(g.performedAt ?? new Date()), fields: { name: order.client.displayName } });
      }
      case 'CheckTransaction': {
        const g = await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: 'PAYNET', externalId: String(p.transactionId ?? '') } } });
        if (!g) return ok({ providerTrnId: 0, timestamp: tashkentStamp(), transactionState: 3 });
        return ok({ providerTrnId: Number(g.seq), timestamp: tashkentStamp(g.performedAt ?? g.createdAt), transactionState: g.state === 'SUCCEEDED' ? 1 : 2 });
      }
      case 'CancelTransaction': {
        const g = await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: 'PAYNET', externalId: String(p.transactionId ?? '') } } });
        if (!g) return err(203);
        if (g.state === 'CANCELLED' || g.state === 'REFUNDED') return err(202);
        return err(77); // qayd etilgan to'lov avtomatik bekor qilinmaydi — qaytarish xodimlar orqali (refund)
      }
      case 'GetStatement': {
        const parse = (s: unknown) => { const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(String(s ?? '')); return m ? new Date(`${m[1]}T${m[2]}+05:00`) : null; };
        const from = parse(p.dateFrom); const to = parse(p.dateTo);
        if (!from || !to) return err(414);
        const rows = await this.db.gatewayTransaction.findMany({ where: { provider: 'PAYNET', state: 'SUCCEEDED', performedAt: { gte: from, lte: to } }, orderBy: { performedAt: 'asc' } });
        return ok({ statements: rows.map((g) => ({ amount: Number(g.amountMinor), transactionId: g.externalId, providerTrnId: Number(g.seq), timestamp: tashkentStamp(g.performedAt!) })) });
      }
      default:
        return err(-32601);
    }
  }
}
