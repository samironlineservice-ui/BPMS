import { Injectable } from '@nestjs/common';
import { Db } from '../../../platform/db.service.js';
import { CaptureService } from '../capture.service.js';
import { parseBasic, ProviderError, safeEq } from '../common.js';
import { GatewayConfigService } from '../config.service.js';
import { PaymentOrdersService } from '../orders.service.js';

/**
 * Uzum Bank Merchant API: bank hamkorning /check, /create, /confirm, /reverse, /status webhook'larini chaqiradi
 * (JSON, Basic auth, summa — tiyin, vaqt — Unix ms). Xato: HTTP 400 + { status: "FAILED", errorCode: "100xx" }.
 */
const CONFIRM_WINDOW_MS = 30 * 60_000; // 30 daqiqada tasdiqlanmasa — FAILED
type Body = Record<string, unknown>;
const ms = (d: Date | null) => (d ? d.getTime() : null);

@Injectable()
export class UzumService {
  constructor(private readonly db: Db, private readonly config: GatewayConfigService, private readonly orders: PaymentOrdersService, private readonly capture: CaptureService) {}

  async handle(action: string, b: Body, authHeader: string | undefined) {
    const c = await this.config.get('UZUM');
    const serviceId = b?.serviceId ?? null;
    const fail = (code: string, extra: Record<string, unknown> = {}) => ({ httpStatus: 400, response: { serviceId, timestamp: Date.now(), status: 'FAILED', errorCode: code, ...extra } });
    const cred = parseBasic(authHeader);
    const authOk = !!c.enabled && !!cred && !!c.secrets.login && safeEq(cred.user, c.secrets.login) && safeEq(cred.pass, c.secrets.password ?? '');
    if (!authOk) return { authOk, ...fail('10001') };
    if (!b || typeof b !== 'object' || (b as { __invalidJson?: boolean }).__invalidJson) return { authOk, ...fail('10002') };
    if (!['check', 'create', 'confirm', 'reverse', 'status'].includes(action)) return { authOk, ...fail('10003') };
    if (String(serviceId) !== String(c.settings.serviceId)) return { authOk, ...fail('10006') };
    const ok = (body: Record<string, unknown>) => ({ authOk, httpStatus: 200, response: { serviceId, ...body } });

    if (action === 'check' || action === 'create') {
      const params = (b.params ?? {}) as Record<string, unknown>;
      const order = await this.orders.resolve(params.account);
      if (!order) return { authOk, ...fail('10007') };
      const data = this.data(order);
      if (action === 'check') {
        if (order.kind === 'FIXED') {
          if (order.status === 'PAID') return { authOk, ...fail('10008') };
          if (order.status !== 'PENDING' || order.expiresAt < new Date()) return { authOk, ...fail('10009') };
        }
        return ok({ timestamp: Date.now(), status: 'OK', data });
      }
      const transId = String(b.transId ?? '');
      if (!transId || !/^\d+$/.test(String(b.amount ?? ''))) return { authOk, ...fail('10005') };
      if (await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: 'UZUM', externalId: transId } } })) return { authOk, ...fail('10010') };
      const amount = BigInt(String(b.amount));
      const why = this.orders.payable(order, amount);
      if (why === 'PAID') return { authOk, ...fail('10008') };
      if (why === 'CLOSED') return { authOk, ...fail('10009') };
      if (why === 'AMOUNT') return { authOk, ...fail(order.kind === 'OPEN_TOPUP' ? '10012' : '10011') };
      try {
        const { tx } = await this.capture.begin({ provider: 'UZUM', externalId: transId, orderId: order.id, orderKind: order.kind, amountMinor: amount, providerTime: new Date() });
        return ok({ transId, status: 'CREATED', transTime: ms(tx.createdAt), data, amount: Number(amount) });
      } catch (e) {
        if (e instanceof ProviderError && e.code === 'BUSY') return { authOk, ...fail('10008') };
        throw e;
      }
    }

    const transId = String(b.transId ?? '');
    const g = transId ? await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: 'UZUM', externalId: transId } }, include: { paymentOrder: { include: { client: true } } } }) : null;
    if (!g) return { authOk, ...fail('10014', { transId }) };
    const data = this.data(g.paymentOrder);
    if (action === 'confirm') {
      if (g.state === 'PENDING' && Date.now() - g.createdAt.getTime() > CONFIRM_WINDOW_MS) await this.capture.cancel(g.id, 4);
      const cur = await this.db.gatewayTransaction.findUniqueOrThrow({ where: { id: g.id } });
      if (cur.state === 'CANCELLED') return { authOk, ...fail('10015', { transId, confirmTime: null }) };
      if (cur.state === 'SUCCEEDED') return { authOk, ...fail('10016', { transId, confirmTime: ms(cur.performedAt) }) };
      const done = await this.capture.succeed(g.id);
      return ok({ transId, status: 'CONFIRMED', confirmTime: ms(done.performedAt), data, amount: Number(g.amountMinor) });
    }
    if (action === 'reverse') {
      if (g.state === 'CANCELLED') return { authOk, ...fail('10018', { transId, reverseTime: ms(g.cancelledAt) }) };
      if (g.state !== 'PENDING') return { authOk, ...fail('10017', { transId, reverseTime: null }) }; // tasdiqlangan to'lov — qaytarish xodimlar orqali
      const done = await this.capture.cancel(g.id, null);
      return ok({ transId, status: 'REVERSED', reverseTime: ms(done.cancelledAt), data, amount: Number(g.amountMinor) });
    }
    // status
    const st = g.state === 'SUCCEEDED' ? 'CONFIRMED' : g.state === 'PENDING' ? 'CREATED' : g.state === 'REFUNDED' ? 'REVERSED' : g.cancelReason === 4 ? 'FAILED' : 'REVERSED';
    return ok({ transId, status: st, transTime: ms(g.createdAt), confirmTime: ms(g.performedAt), reverseTime: ms(g.cancelledAt), data, amount: Number(g.amountMinor) });
  }

  private data(order: { number: string; kind: string; amountMinor: bigint | null; client: { displayName: string } }) {
    return {
      account: { value: order.number },
      fio: { value: order.client.displayName },
      ...(order.kind === 'FIXED' && order.amountMinor !== null ? { amount: { value: String(order.amountMinor) } } : {}),
    };
  }
}
