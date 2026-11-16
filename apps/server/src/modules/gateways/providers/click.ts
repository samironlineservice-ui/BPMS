import { Injectable } from '@nestjs/common';
import { env } from '../../../config/env.js';
import { Db } from '../../../platform/db.service.js';
import { CaptureService } from '../capture.service.js';
import { md5, ProviderError, safeEq, sha1, soumToTiyin, tiyinToSoum } from '../common.js';
import type { ActiveConfig } from '../config.service.js';
import { GatewayConfigService } from '../config.service.js';
import { PaymentOrdersService } from '../orders.service.js';

/** CLICK SHOP API (prepare/complete, application/x-www-form-urlencoded → JSON). Hujjat: docs.click.uz */
const NOTE: Record<number, string> = {
  0: 'Success', [-1]: 'SIGN CHECK FAILED!', [-2]: 'Incorrect parameter amount', [-3]: 'Action not found', [-4]: 'Already paid',
  [-5]: 'User does not exist', [-6]: 'Transaction does not exist', [-7]: 'Failed to update user', [-8]: 'Error in request from click', [-9]: 'Transaction cancelled',
};
type Body = Record<string, string | undefined>;

@Injectable()
export class ClickService {
  constructor(private readonly db: Db, private readonly config: GatewayConfigService, private readonly orders: PaymentOrdersService, private readonly capture: CaptureService) {}

  payUrl(c: ActiveConfig, order: { id: string; number: string; amountMinor: bigint | null }) {
    if (c.mode === 'EMULATOR') return `${env.PORTAL_ORIGIN}/pay/emulator/${order.id}?provider=CLICK`;
    const q = new URLSearchParams({
      service_id: c.settings.serviceId ?? '', merchant_id: c.merchantId, amount: tiyinToSoum(order.amountMinor ?? 0n),
      transaction_param: order.number, return_url: `${env.PORTAL_ORIGIN}/pay/result/${order.id}`,
    });
    return `https://my.click.uz/services/pay?${q}`;
  }

  private signOk(c: ActiveConfig, b: Body, complete: boolean) {
    const s = `${b.click_trans_id ?? ''}${b.service_id ?? ''}${c.secrets.secretKey ?? ''}${b.merchant_trans_id ?? ''}${complete ? b.merchant_prepare_id ?? '' : ''}${b.amount ?? ''}${b.action ?? ''}${b.sign_time ?? ''}`;
    return !!c.secrets.secretKey && !!b.sign_string && safeEq(md5(s), String(b.sign_string).toLowerCase());
  }

  async prepare(b: Body) {
    const c = await this.config.get('CLICK');
    const out = (error: number, extra: Record<string, unknown> = {}) => ({
      click_trans_id: Number(b.click_trans_id) || b.click_trans_id, merchant_trans_id: b.merchant_trans_id, ...extra, error, error_note: NOTE[error],
    });
    const authOk = c.enabled && this.signOk(c, b, false);
    if (!authOk) return { authOk, response: out(-1) };
    if (String(b.service_id) !== String(c.settings.serviceId)) return { authOk, response: out(-1) };
    if (String(b.action) !== '0') return { authOk, response: out(-3) };
    const order = await this.orders.resolve(b.merchant_trans_id);
    if (!order) return { authOk, response: out(-5) };
    const amount = soumToTiyin(b.amount ?? '');
    if (amount === null) return { authOk, response: out(-2) };
    const why = this.orders.payable(order, amount);
    if (why === 'PAID') return { authOk, response: out(-4) };
    if (why === 'CLOSED') return { authOk, response: out(-9) };
    if (why === 'AMOUNT') return { authOk, response: out(-2) };
    if (Number(b.error) < 0) return { authOk, response: out(-9) };
    try {
      const { tx } = await this.capture.begin({
        provider: 'CLICK', externalId: String(b.click_trans_id), orderId: order.id, orderKind: order.kind, amountMinor: amount, providerTime: new Date(),
      });
      if (tx.state === 'SUCCEEDED') return { authOk, response: out(-4) };
      if (tx.state !== 'PENDING') return { authOk, response: out(-9) };
      return { authOk, response: out(0, { merchant_prepare_id: Number(tx.seq) }) };
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'BUSY') return { authOk, response: out(-8) };
      throw e;
    }
  }

  async complete(b: Body) {
    const c = await this.config.get('CLICK');
    const out = (error: number, extra: Record<string, unknown> = {}) => ({
      click_trans_id: Number(b.click_trans_id) || b.click_trans_id, merchant_trans_id: b.merchant_trans_id, ...extra, error, error_note: NOTE[error],
    });
    const authOk = c.enabled && this.signOk(c, b, true);
    if (!authOk) return { authOk, response: out(-1) };
    if (String(b.service_id) !== String(c.settings.serviceId)) return { authOk, response: out(-1) };
    if (String(b.action) !== '1') return { authOk, response: out(-3) };
    const seq = /^\d+$/.test(String(b.merchant_prepare_id ?? '')) ? BigInt(String(b.merchant_prepare_id)) : -1n;
    const g = await this.db.gatewayTransaction.findFirst({ where: { provider: 'CLICK', externalId: String(b.click_trans_id), seq } });
    if (!g) return { authOk, response: out(-6) };
    const confirm = { merchant_confirm_id: Number(g.seq) };
    if (g.state === 'CANCELLED') return { authOk, response: out(-9, confirm) };
    if (g.state === 'SUCCEEDED') return { authOk, response: out(-4, confirm) };
    if (Number(b.error) < 0) { await this.capture.cancel(g.id, Number(b.error)); return { authOk, response: out(-9, confirm) }; }
    const amount = soumToTiyin(b.amount ?? '');
    if (amount === null || amount !== g.amountMinor) return { authOk, response: out(-2, confirm) };
    await this.capture.succeed(g.id);
    return { authOk, response: out(0, confirm) };
  }

  // ── Merchant API (karta tokeni): Auth: merchant_user_id:sha1(timestamp+secret_key):timestamp ──
  async merchant<T extends { error_code?: number | string; error_note?: string }>(c: ActiveConfig, method: 'POST' | 'DELETE' | 'GET', path: string, body?: unknown): Promise<T> {
    const base = c.mode === 'EMULATOR' ? `http://127.0.0.1:${env.PORT}/api/v1/gateways/emulator/click-api` : 'https://api.click.uz/v2/merchant';
    const ts = Math.floor(Date.now() / 1000).toString();
    const r = await fetch(base + path, {
      method, signal: AbortSignal.timeout(45_000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Auth: `${c.settings.merchantUserId ?? ''}:${sha1(ts + (c.secrets.secretKey ?? ''))}:${ts}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as T;
    if (!r.ok || Number(j.error_code ?? -1) !== 0) throw new ProviderError(j.error_code ?? r.status, j.error_note || `Click javob bermadi (HTTP ${r.status})`);
    return j;
  }
}
