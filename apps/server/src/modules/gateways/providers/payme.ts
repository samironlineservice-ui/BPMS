import { Injectable } from '@nestjs/common';
import { env } from '../../../config/env.js';
import { Db } from '../../../platform/db.service.js';
import { CaptureService } from '../capture.service.js';
import { parseBasic, ProviderError, safeEq } from '../common.js';
import type { ActiveConfig } from '../config.service.js';
import { GatewayConfigService } from '../config.service.js';
import { PaymentOrdersService } from '../orders.service.js';

/** Payme Merchant API (JSON-RPC 2.0; javob har doim HTTP 200). Hujjat: developer.help.paycom.uz */
const ERR: Record<string, [number, string, string, string]> = {
  AUTH: [-32504, 'Недостаточно привилегий для выполнения метода', "Metodni bajarish uchun ruxsat yo'q", 'Insufficient privileges'],
  METHOD: [-32601, 'Метод не найден', 'Metod topilmadi', 'Method not found'],
  REQUEST: [-32600, 'Неверный JSON-RPC запрос', "Noto'g'ri JSON-RPC so'rov", 'Invalid JSON-RPC request'],
  PARSE: [-32700, 'Ошибка парсинга JSON', 'JSON xato', 'Parse error'],
  AMOUNT: [-31001, 'Неверная сумма', "Noto'g'ri summa", 'Incorrect amount'],
  NOT_FOUND: [-31003, 'Транзакция не найдена', 'Tranzaksiya topilmadi', 'Transaction not found'],
  CANT_CANCEL: [-31007, 'Невозможно отменить транзакцию: заказ выполнен', "Tranzaksiyani bekor qilib bo'lmaydi: buyurtma bajarilgan", 'Cannot cancel: order completed'],
  CANT_PERFORM: [-31008, 'Невозможно выполнить операцию', "Amalni bajarib bo'lmaydi", 'Unable to perform operation'],
  ACCOUNT: [-31050, 'Заказ не найден', 'Buyurtma topilmadi', 'Order not found'],
  PAID: [-31051, 'Заказ уже оплачен', "Buyurtma allaqachon to'langan", 'Order already paid'],
  BUSY: [-31052, 'По заказу ожидается другая транзакция', "Buyurtma bo'yicha boshqa to'lov kutilmoqda", 'Another transaction is pending for this order'],
  CLOSED: [-31053, 'Заказ закрыт или просрочен', "Buyurtma yopilgan yoki muddati o'tgan", 'Order is closed or expired'],
  SYSTEM: [-32400, 'Системная ошибка', 'Tizim xatosi', 'System error'],
};
class PaymeErr extends Error { constructor(public readonly kind: keyof typeof ERR, public readonly data?: string) { super(kind); } }
const TIMEOUT_MS = 43_200_000; // 12 soat
const STATE: Record<string, number> = { PENDING: 1, SUCCEEDED: 2, CANCELLED: -1, REFUNDED: -2 };
const ms = (d: Date | null) => (d ? d.getTime() : 0);

@Injectable()
export class PaymeService {
  constructor(private readonly db: Db, private readonly config: GatewayConfigService, private readonly orders: PaymentOrdersService, private readonly capture: CaptureService) {}

  private key(c: ActiveConfig) { return c.mode === 'PROD' ? c.secrets.key ?? '' : c.secrets.testKey || c.secrets.key || ''; }

  /** Checkout havolasi: base64("m=…;ac.order_id=…;a=…;c=…;l=uz"). Emulyatorda — lokal sinov sahifasi. */
  checkoutUrl(c: ActiveConfig, order: { id: string; number: string; amountMinor: bigint | null }) {
    if (c.mode === 'EMULATOR') return `${env.PORTAL_ORIGIN}/pay/emulator/${order.id}?provider=PAYME`;
    const field = c.settings.accountField || 'order_id';
    const params = `m=${c.merchantId};ac.${field}=${order.number};a=${order.amountMinor};c=${env.PORTAL_ORIGIN}/pay/result/${order.id};l=uz`;
    return `${c.mode === 'PROD' ? 'https://checkout.paycom.uz' : 'https://test.paycom.uz'}/${Buffer.from(params).toString('base64')}`;
  }

  /** Front-end karta qo'shishi uchun (cards.create — to'g'ridan-to'g'ri Payme'ga, X-Auth: merchant id). */
  subscribeEndpoint(c: ActiveConfig) {
    return c.mode === 'PROD' ? 'https://checkout.paycom.uz/api' : c.mode === 'TEST' ? 'https://checkout.test.paycom.uz/api' : '/api/v1/gateways/emulator/payme-api';
  }

  async handle(body: { id?: unknown; method?: string; params?: Record<string, unknown> }, authHeader: string | undefined) {
    const id = body?.id ?? null;
    const c = await this.config.get('PAYME');
    const cred = parseBasic(authHeader);
    const authOk = !!c.enabled && !!cred && cred.user === 'Paycom' && !!this.key(c) && safeEq(cred.pass, this.key(c));
    try {
      if ((body as { __invalidJson?: boolean })?.__invalidJson) throw new PaymeErr('PARSE');
      if (!authOk) throw new PaymeErr('AUTH');
      if (!body || typeof body.method !== 'string' || typeof body.params !== 'object' || body.params === null) throw new PaymeErr('REQUEST');
      const p = body.params;
      const result = await this.dispatch(body.method, p, c);
      return { authOk, response: { jsonrpc: '2.0', id, result } };
    } catch (e) {
      const kind: keyof typeof ERR = e instanceof PaymeErr ? e.kind : e instanceof ProviderError && e.code === 'BUSY' ? 'BUSY' : e instanceof ProviderError && e.code === 'STATE' ? 'CANT_PERFORM' : 'SYSTEM';
      const [code, ru, uz, en] = ERR[kind]!;
      return { authOk, response: { jsonrpc: '2.0', id, error: { code, message: { ru, uz, en }, data: e instanceof PaymeErr ? e.data ?? null : null } } };
    }
  }

  private async dispatch(method: string, p: Record<string, unknown>, c: ActiveConfig) {
    switch (method) {
      case 'CheckPerformTransaction': {
        const { order } = await this.checkOrder(p, c);
        const live = order.kind === 'FIXED' && (await this.db.gatewayTransaction.count({ where: { paymentOrderId: order.id, state: 'PENDING' } }));
        if (live) throw new PaymeErr('BUSY', this.field(c));
        return { allow: true, ...this.detail(c, order, BigInt(String(p.amount))) };
      }
      case 'CreateTransaction': {
        const extId = String(p.id ?? '');
        if (!extId) throw new PaymeErr('REQUEST');
        const ex = await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: 'PAYME', externalId: extId } } });
        if (ex) {
          if (ex.state !== 'PENDING') throw new PaymeErr('CANT_PERFORM');
          if (Date.now() - ms(ex.providerTime) > TIMEOUT_MS) { await this.capture.cancel(ex.id, 4); throw new PaymeErr('CANT_PERFORM'); }
          return { create_time: ms(ex.createdAt), transaction: String(ex.seq), state: 1 };
        }
        const { order, amount } = await this.checkOrder(p, c);
        const time = Number(p.time);
        if (!Number.isFinite(time) || Date.now() - time > TIMEOUT_MS) throw new PaymeErr('CANT_PERFORM');
        const { tx } = await this.capture.begin({ provider: 'PAYME', externalId: extId, orderId: order.id, orderKind: order.kind, amountMinor: amount, providerTime: new Date(time) });
        return { create_time: ms(tx.createdAt), transaction: String(tx.seq), state: STATE[tx.state] };
      }
      case 'PerformTransaction': {
        const g = await this.find(p.id);
        if (g.state === 'PENDING') {
          if (Date.now() - ms(g.providerTime) > TIMEOUT_MS) { await this.capture.cancel(g.id, 4); throw new PaymeErr('CANT_PERFORM'); }
          const done = await this.capture.succeed(g.id);
          return { transaction: String(done.seq), perform_time: ms(done.performedAt), state: 2 };
        }
        if (g.state === 'SUCCEEDED') return { transaction: String(g.seq), perform_time: ms(g.performedAt), state: 2 };
        throw new PaymeErr('CANT_PERFORM');
      }
      case 'CancelTransaction': {
        const g = await this.find(p.id);
        if (g.state === 'PENDING') {
          const r = Number(p.reason);
          const done = await this.capture.cancel(g.id, Number.isInteger(r) ? r : null);
          return { transaction: String(done.seq), cancel_time: ms(done.cancelledAt), state: -1 };
        }
        if (g.state === 'CANCELLED') return { transaction: String(g.seq), cancel_time: ms(g.cancelledAt), state: -1 };
        if (g.state === 'REFUNDED') return { transaction: String(g.seq), cancel_time: ms(g.cancelledAt), state: -2 };
        throw new PaymeErr('CANT_CANCEL'); // to'lov qayd etilgan va xizmatga ishlatilgan — qaytarish xodimlar orqali (refund)
      }
      case 'CheckTransaction': {
        const g = await this.find(p.id);
        return {
          create_time: ms(g.createdAt), perform_time: ms(g.performedAt), cancel_time: ms(g.cancelledAt), transaction: String(g.seq),
          state: STATE[g.state], reason: g.cancelReason ?? null,
        };
      }
      case 'GetStatement': {
        const from = new Date(Number(p.from)); const to = new Date(Number(p.to));
        const rows = await this.db.gatewayTransaction.findMany({
          where: { provider: 'PAYME', providerTime: { gte: from, lte: to } }, orderBy: { providerTime: 'asc' }, include: { paymentOrder: { select: { number: true } } },
        });
        return {
          transactions: rows.map((g) => ({
            id: g.externalId, time: ms(g.providerTime), amount: Number(g.amountMinor), account: { [this.field(c)]: g.paymentOrder.number },
            create_time: ms(g.createdAt), perform_time: ms(g.performedAt), cancel_time: ms(g.cancelledAt), transaction: String(g.seq),
            state: STATE[g.state], reason: g.cancelReason ?? null, receivers: null,
          })),
        };
      }
      case 'SetFiscalData': {
        const g = await this.find(p.id);
        await this.db.gatewayTransaction.update({ where: { id: g.id }, data: { fiscalData: (p.fiscal_data ?? p) as object } });
        return { success: true };
      }
      default:
        throw new PaymeErr('METHOD', method);
    }
  }

  private field(c: ActiveConfig) { return c.settings.accountField || 'order_id'; }

  private async checkOrder(p: Record<string, unknown>, c: ActiveConfig) {
    const acc = (p.account ?? {}) as Record<string, unknown>;
    const order = await this.orders.resolve(acc[this.field(c)] ?? acc.order_id ?? acc.account);
    if (!order) throw new PaymeErr('ACCOUNT', this.field(c));
    if (!/^\d+$/.test(String(p.amount ?? ''))) throw new PaymeErr('AMOUNT');
    const amount = BigInt(String(p.amount));
    const why = this.orders.payable(order, amount);
    if (why === 'AMOUNT') throw new PaymeErr('AMOUNT');
    if (why === 'PAID') throw new PaymeErr('PAID', this.field(c));
    if (why === 'CLOSED') throw new PaymeErr('CLOSED', this.field(c));
    return { order, amount };
  }

  private async find(extId: unknown) {
    const g = await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: 'PAYME', externalId: String(extId ?? '') } } });
    if (!g) throw new PaymeErr('NOT_FOUND');
    return g;
  }

  /** Fiskal chek (MXIK sozlangan bo'lsa). QQS 0 (kompaniya hozircha QQS to'lovchisi emas). */
  private detail(c: ActiveConfig, order: { number: string }, amount: bigint) {
    if (!c.settings.ikpu) return {};
    return {
      detail: {
        receipt_type: 0,
        items: [{ title: `ADS xizmatlari (buyurtma ${order.number})`, price: Number(amount), count: 1, code: c.settings.ikpu, package_code: c.settings.packageCode || '', vat_percent: 0 }],
      },
    };
  }

  // ── Subscribe API (karta bilan to'lov): server tomoni — X-Auth: id:key ──
  async subscribe<T>(c: ActiveConfig, method: string, params: Record<string, unknown>): Promise<T> {
    const url = c.mode === 'EMULATOR' ? `http://127.0.0.1:${env.PORT}/api/v1/gateways/emulator/payme-api` : this.subscribeEndpoint(c);
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Auth': `${c.merchantId}:${this.key(c)}` },
      body: JSON.stringify({ id: Date.now(), method, params }), signal: AbortSignal.timeout(45_000),
    });
    const j = (await r.json().catch(() => ({}))) as { result?: T; error?: { code?: number; message?: { uz?: string; ru?: string } | string } };
    if (j.error || !j.result) {
      const m = typeof j.error?.message === 'string' ? j.error.message : j.error?.message?.uz ?? j.error?.message?.ru;
      throw new ProviderError(j.error?.code ?? 'PAYME', m || `Payme javob bermadi (HTTP ${r.status})`);
    }
    return j.result;
  }
}
