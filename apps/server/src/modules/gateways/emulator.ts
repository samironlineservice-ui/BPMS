import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EmulatorPayInput, EmulatorResult } from '@ads/contracts';
import { env, isProd } from '../../config/env.js';
import { hmacSign } from '../../platform/crypto.js';
import { Db } from '../../platform/db.service.js';
import { badRequest, notFound } from '../../platform/errors.js';
import { basic, MIN_TOPUP, md5, type ProviderKey, safeEq, sha1, soumToTiyin, tashkentStamp, tiyinToSoum } from './common.js';
import { type ActiveConfig, GatewayConfigService } from './config.service.js';

/**
 * EMULYATOR — faqat lokal muhit uchun (production'da hech qaysi metodi ishlamaydi).
 * Provayder serveri o'rnida turib, BIZNING webhook'larimizni haqiqiy protokol bo'yicha (HTTP, Basic auth, MD5 imzo,
 * takroriy so'rovlar) chaqiradi. Shuning uchun merchant kalitlari va ommaviy URL'siz ham butun oqim sinovdan o'tadi.
 * Kartalar: faqat Payme sandbox'ining ommaviy sinov kartalari; SMS kod — sandbox'dagi kabi.
 */
export const TEST_CARDS = [
  { number: '8600069195406311', expire: '0399' },
  { number: '8600495473316478', expire: '0399' },
];
export const TEST_SMS_CODE = '666666';
const PHONE_MASK = '99890*****31';

type Step = EmulatorResult['steps'][number];
type Json = Record<string, unknown>;
type CardClaims = { n: string; e: string; v: 0 | 1 };
type ReceiptClaims = { a: number; acc: Json; r: string };

const maskPan = (pan: string) => `${pan.slice(0, 6)}******${pan.slice(-4)}`;
const pack = (purpose: string, data: object) => { const b = Buffer.from(JSON.stringify(data)).toString('base64url'); return `${b}.${hmacSign(purpose, b)}`; };
function unpack<T>(purpose: string, token: unknown): T | null {
  const [b, s] = String(token ?? '').split('.');
  if (!b || !s || !safeEq(hmacSign(purpose, b), s)) return null;
  try { return JSON.parse(Buffer.from(b, 'base64url').toString('utf8')) as T; } catch { return null; }
}
const testCard = (number?: string, expire?: string) => {
  const n = (number ?? '').replace(/\D/g, ''); const e = (expire ?? '').replace(/\D/g, '');
  return TEST_CARDS.find((t) => t.number === n && t.expire === e) ?? null;
};

@Injectable()
export class EmulatorService {
  constructor(private readonly db: Db, private readonly config: GatewayConfigService) {}

  /** Provayder emulyator rejimida va muhit production emas. */
  async require(provider: ProviderKey) {
    if (isProd) throw notFound('Sahifa');
    const c = await this.config.get(provider);
    if (!c.enabled || c.mode !== 'EMULATOR') throw badRequest('Bu provayder emulyator rejimida emas');
    return c;
  }

  async anyEnabled() {
    if (isProd) return false;
    return (await this.config.enabledList()).some((c) => c.mode === 'EMULATOR');
  }

  testCards() {
    return TEST_CARDS.map((t) => ({ number: t.number.replace(/(\d{4})(?=\d)/g, '$1 '), expire: `${t.expire.slice(0, 2)}/${t.expire.slice(2)}`, note: "Payme sandbox'ining ommaviy sinov kartasi" }));
  }

  /** Emulyator sahifasidagi "To'lash": karta + SMS tekshiruvi, keyin provayder sifatida webhook'larni chaqirish. */
  async payOrder(clientId: string, orderId: string, input: EmulatorPayInput): Promise<EmulatorResult> {
    const c = await this.require(input.provider);
    const o = await this.db.paymentOrder.findFirst({ where: { id: orderId, clientId } });
    if (!o || o.kind !== 'FIXED' || o.amountMinor === null) throw notFound("To'lov buyurtmasi");
    if (o.provider && o.provider !== input.provider) throw badRequest('Buyurtma boshqa to\'lov tizimi uchun yaratilgan');
    if (o.status !== 'PENDING') throw badRequest(o.status === 'PAID' ? "Buyurtma allaqachon to'langan" : 'Buyurtma yopilgan');
    if (input.provider !== 'PAYNET') this.checkCard(input);
    return this.simulate(c, o.number, o.amountMinor, input.scenario);
  }

  /** Shaxsiy hisobni to'ldirish (mijoz ilovada/terminalda 8 raqamli hisob raqamini kiritadi). */
  async topup(clientId: string, input: EmulatorPayInput & { amount: string }): Promise<EmulatorResult> {
    const c = await this.require(input.provider);
    const client = await this.db.client.findUniqueOrThrow({ where: { id: clientId } });
    const amount = soumToTiyin(input.amount);
    if (amount === null || amount < MIN_TOPUP) throw badRequest(`Minimal summa — ${tiyinToSoum(MIN_TOPUP).replace('.00', '')} so'm`);
    if (input.provider !== 'PAYNET') this.checkCard(input);
    return this.simulate(c, client.accountNo, amount, input.scenario);
  }

  private checkCard(i: { cardNumber?: string; expire?: string; smsCode?: string }) {
    if (!testCard(i.cardNumber, i.expire)) throw badRequest("Emulyator faqat sinov kartalarini qabul qiladi (ro'yxat sahifada)");
    if ((i.smsCode ?? '') !== TEST_SMS_CODE) throw badRequest("SMS kod noto'g'ri");
  }

  simulate(c: ActiveConfig, account: string, amount: bigint, scenario: 'pay' | 'decline'): Promise<EmulatorResult> {
    switch (c.provider) {
      case 'PAYME': return this.payme(c, account, amount, scenario);
      case 'CLICK': return this.click(c, account, amount, scenario);
      case 'UZUM': return this.uzum(c, account, amount, scenario);
      case 'PAYNET': return this.paynet(c, account, amount, scenario);
    }
  }

  // ── Webhook'larga HTTP so'rov (xuddi tashqi server kabi) ──
  private async post(path: string, body: string, headers: Record<string, string>) {
    const r = await fetch(`http://127.0.0.1:${env.PORT}/api/v1${path}`, { method: 'POST', body, headers, signal: AbortSignal.timeout(30_000) });
    const json = (await r.json().catch(() => ({}))) as Json;
    return { status: r.status, json };
  }

  private paymeKey(c: ActiveConfig) { return c.secrets.testKey || c.secrets.key || ''; }

  /** Payme Merchant API'ni chaqirish (Payme serveri nomidan). */
  private async paymeRpc(c: ActiveConfig, method: string, params: Json) {
    const r = await this.post('/gateways/payme', JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }), {
      'content-type': 'application/json', authorization: basic('Paycom', this.paymeKey(c)),
    });
    const err = r.json.error as { code: number; message?: { uz?: string } } | undefined;
    return { ok: !err, result: (r.json.result ?? null) as Json | null, step: { name: method, ok: !err, detail: err ? `${err.code}: ${err.message?.uz ?? ''}` : brief(r.json.result) } };
  }

  private async payme(c: ActiveConfig, account: string, amount: bigint, scenario: 'pay' | 'decline', txId?: string): Promise<EmulatorResult> {
    const acc = { [c.settings.accountField || 'order_id']: account };
    const id = txId ?? crypto.randomBytes(12).toString('hex'); // Payme tranzaksiya id — 24 belgi
    const time = Date.now();
    const steps: Step[] = [];
    const call = async (m: string, p: Json) => { const r = await this.paymeRpc(c, m, p); steps.push(r.step); return r; };
    if (!(await call('CheckPerformTransaction', { amount: Number(amount), account: acc })).ok) return done(steps, false, "Buyurtma to'lovga yaroqsiz");
    if (!(await call('CreateTransaction', { id, time, amount: Number(amount), account: acc })).ok) return done(steps, false, 'Tranzaksiya yaratilmadi');
    await call('CreateTransaction', { id, time, amount: Number(amount), account: acc }); // sandbox kabi takroriy so'rov — idempotent bo'lishi shart
    if (scenario === 'decline') {
      await call('CancelTransaction', { id, reason: 2 }); // kartadan yechib bo'lmadi
      return done(steps, false, "Karta rad etildi (sinov stsenariysi) — to'lov bekor qilindi");
    }
    const pf = await call('PerformTransaction', { id });
    await call('PerformTransaction', { id });
    await call('CheckTransaction', { id });
    return done(steps, pf.ok && pf.result?.state === 2, pf.ok ? "To'lov muvaffaqiyatli" : "To'lov amalga oshmadi");
  }

  private async click(c: ActiveConfig, account: string, amount: bigint, scenario: 'pay' | 'decline', clickTransId?: string): Promise<EmulatorResult> {
    const transId = clickTransId ?? String(crypto.randomInt(1_000_000_000, 2_000_000_000));
    const serviceId = c.settings.serviceId ?? '';
    const amountStr = tiyinToSoum(amount);
    const signTime = tashkentStamp();
    const sign = (action: string, prepareId = '') => md5(`${transId}${serviceId}${c.secrets.secretKey ?? ''}${account}${prepareId}${amountStr}${action}${signTime}`);
    const steps: Step[] = [];
    const call = async (name: string, path: string, f: Record<string, string>) => {
      const r = await this.post(path, new URLSearchParams(f).toString(), { 'content-type': 'application/x-www-form-urlencoded' });
      const ok = Number(r.json.error) === 0;
      steps.push({ name, ok, detail: `error=${String(r.json.error)} ${String(r.json.error_note ?? '')}`.trim() });
      return r.json;
    };
    const base = { click_trans_id: transId, service_id: serviceId, click_paydoc_id: String(crypto.randomInt(1_000_000, 9_000_000)), merchant_trans_id: account, amount: amountStr, sign_time: signTime };
    const prep = await call('Prepare', '/gateways/click/prepare', { ...base, action: '0', error: '0', error_note: 'Success', sign_string: sign('0') });
    if (Number(prep.error) !== 0) return done(steps, false, 'Prepare rad etildi');
    const prepareId = String(prep.merchant_prepare_id);
    const err = scenario === 'decline' ? '-5017' : '0';
    const fields = { ...base, merchant_prepare_id: prepareId, action: '1', error: err, error_note: scenario === 'decline' ? 'Insufficient funds' : 'Success', sign_string: sign('1', prepareId) };
    const comp = await call('Complete', '/gateways/click/complete', fields);
    await call('Complete (takroriy)', '/gateways/click/complete', fields);
    if (scenario === 'decline') return done(steps, false, "Karta rad etildi (sinov stsenariysi) — to'lov bekor qilindi");
    return done(steps, Number(comp.error) === 0, Number(comp.error) === 0 ? "To'lov muvaffaqiyatli" : "To'lov amalga oshmadi");
  }

  private async uzum(c: ActiveConfig, account: string, amount: bigint, scenario: 'pay' | 'decline'): Promise<EmulatorResult> {
    const auth = basic(c.secrets.login ?? '', c.secrets.password ?? '');
    const serviceId = Number(c.settings.serviceId);
    const transId = crypto.randomUUID();
    const steps: Step[] = [];
    const call = async (action: string, b: Json) => {
      const r = await this.post(`/gateways/uzum/${action}`, JSON.stringify({ serviceId, timestamp: Date.now(), ...b }), { 'content-type': 'application/json', authorization: auth });
      const ok = r.status === 200;
      steps.push({ name: action, ok, detail: ok ? String(r.json.status) : `${String(r.json.errorCode)}` });
      return { ok, json: r.json };
    };
    if (!(await call('check', { params: { account } })).ok) return done(steps, false, "Hisob topilmadi yoki to'lovga yaroqsiz");
    if (!(await call('create', { transId, params: { account }, amount: Number(amount) })).ok) return done(steps, false, 'Tranzaksiya yaratilmadi');
    if (scenario === 'decline') {
      await call('reverse', { transId });
      return done(steps, false, "Karta rad etildi (sinov stsenariysi) — to'lov bekor qilindi");
    }
    const cf = await call('confirm', { transId, paymentSource: 'UZCARD', tariff: null, processingReferenceNumber: null, phone: '998900000000' });
    await call('status', { transId });
    return done(steps, cf.ok, cf.ok ? "To'lov muvaffaqiyatli" : "To'lov amalga oshmadi");
  }

  private async paynet(c: ActiveConfig, account: string, amount: bigint, scenario: 'pay' | 'decline'): Promise<EmulatorResult> {
    const auth = basic(c.secrets.login ?? '', c.secrets.password ?? '');
    const serviceId = Number(c.settings.serviceId);
    const transactionId = crypto.randomInt(100_000_000, 2_000_000_000);
    const steps: Step[] = [];
    const call = async (method: string, params: Json) => {
      const r = await this.post('/gateways/paynet', JSON.stringify({ jsonrpc: '2.0', id: crypto.randomInt(1, 1_000_000), method, params }), { 'content-type': 'application/json', authorization: auth });
      const err = r.json.error as { code: number; message?: string } | undefined;
      const ok = r.status === 200 && !err;
      steps.push({ name: method, ok, detail: ok ? brief(r.json.result) : err ? `${err.code}: ${err.message ?? ''}` : `HTTP ${r.status}` });
      return { ok, result: (r.json.result ?? null) as Json | null };
    };
    if (!(await call('GetInformation', { serviceId, fields: { account } })).ok) return done(steps, false, 'Hisob topilmadi');
    if (scenario === 'decline') return done(steps, false, "Mijoz to'lovni bekor qildi (sinov stsenariysi)");
    const pf = await call('PerformTransaction', { amount: Number(amount), serviceId, transactionId, transactionTime: tashkentStamp(), fields: { account } });
    await call('PerformTransaction', { amount: Number(amount), serviceId, transactionId, transactionTime: tashkentStamp(), fields: { account } }); // takror → 201
    await call('CheckTransaction', { serviceId, transactionId, transactionTime: tashkentStamp() });
    return done(steps, pf.ok, pf.ok ? "To'lov muvaffaqiyatli" : "To'lov amalga oshmadi");
  }

  // ── Payme Subscribe API (karta tokeni) emulyatsiyasi: /gateways/emulator/payme-api ──
  async paymeApi(body: { id?: unknown; method?: string; params?: Json }, xAuth: string | undefined) {
    const id = body?.id ?? null;
    const fail = (code: number, uz: string) => ({ jsonrpc: '2.0', id, error: { code, message: { uz, ru: uz, en: uz } } });
    const ok = (result: Json) => ({ jsonrpc: '2.0', id, result });
    let c: ActiveConfig;
    try { c = await this.require('PAYME'); } catch { return fail(-32504, "Emulyator o'chirilgan"); }
    const [mid, key] = String(xAuth ?? '').split(':');
    if (mid !== c.merchantId) return fail(-32504, "Ruxsat yo'q (X-Auth)");
    const backend = key !== undefined;
    if (backend && !safeEq(key, this.paymeKey(c))) return fail(-32504, "Ruxsat yo'q (X-Auth kaliti)");
    const p = body?.params ?? {};
    const card = (claims: CardClaims) => ({ number: claims.n, expire: claims.e, token: pack('emu:payme:card', claims), recurrent: true, verify: claims.v === 1 });
    switch (body?.method) {
      case 'cards.create': {
        const raw = (p.card ?? {}) as { number?: string; expire?: string };
        const t = testCard(raw.number, raw.expire);
        if (!t) return fail(-31300, "Karta raqami yoki amal qilish muddati noto'g'ri (emulyator faqat sinov kartalarini qabul qiladi)");
        return ok({ card: card({ n: maskPan(t.number), e: `${t.expire.slice(0, 2)}/${t.expire.slice(2)}`, v: 0 }) });
      }
      case 'cards.get_verify_code': {
        if (!unpack<CardClaims>('emu:payme:card', p.token)) return fail(-31400, 'Karta topilmadi');
        return ok({ sent: true, phone: PHONE_MASK, wait: 60_000 });
      }
      case 'cards.verify': {
        const claims = unpack<CardClaims>('emu:payme:card', p.token);
        if (!claims) return fail(-31400, 'Karta topilmadi');
        if (String(p.code ?? '') !== TEST_SMS_CODE) return fail(-31103, "SMS kod noto'g'ri");
        return ok({ card: card({ ...claims, v: 1 }) });
      }
      case 'cards.check': {
        if (!backend) return fail(-32504, "Ruxsat yo'q");
        const claims = unpack<CardClaims>('emu:payme:card', p.token);
        return claims ? ok({ card: card(claims) }) : fail(-31400, 'Karta topilmadi');
      }
      case 'cards.remove': {
        if (!backend) return fail(-32504, "Ruxsat yo'q");
        return ok({ success: true });
      }
      case 'receipts.create': {
        if (!backend) return fail(-32504, "Ruxsat yo'q");
        const amount = Number(p.amount); const account = (p.account ?? {}) as Json;
        if (!Number.isSafeInteger(amount) || amount <= 0) return fail(-31001, "Noto'g'ri summa");
        // Haqiqiy Payme ham chek yaratishda merchant'dan CheckPerformTransaction so'raydi
        const chk = await this.paymeRpc(c, 'CheckPerformTransaction', { amount, account });
        if (!chk.ok) return fail(-31050, `Merchant rad etdi: ${chk.step.detail}`);
        const rid = pack('emu:payme:receipt', { a: amount, acc: account, r: crypto.randomBytes(6).toString('hex') } satisfies ReceiptClaims);
        return ok({ receipt: { _id: rid, create_time: Date.now(), state: 0, amount, account: Object.entries(account).map(([name, value]) => ({ name, value })) } });
      }
      case 'receipts.pay': {
        if (!backend) return fail(-32504, "Ruxsat yo'q");
        const rc = unpack<ReceiptClaims>('emu:payme:receipt', p.id);
        const cd = unpack<CardClaims>('emu:payme:card', p.token);
        if (!rc) return fail(-31602, 'Chek topilmadi');
        if (!cd || cd.v !== 1) return fail(-31400, 'Karta tasdiqlanmagan');
        const txId = crypto.createHash('sha256').update(String(p.id)).digest('hex').slice(0, 24); // bitta chek — bitta tranzaksiya
        const acc = Object.values(rc.acc)[0];
        const r = await this.payme(c, String(acc ?? ''), BigInt(rc.a), 'pay', txId);
        if (!r.ok) return fail(-31630, r.steps.filter((s) => !s.ok).map((s) => `${s.name} ${s.detail}`).join('; ') || r.message);
        return ok({ receipt: { _id: p.id, state: 4, pay_time: Date.now(), amount: rc.a } });
      }
      default:
        return fail(-32601, 'Metod topilmadi');
    }
  }

  // ── Click Merchant API (karta tokeni) emulyatsiyasi: /gateways/emulator/click-api/* ──
  async clickApi(method: string, path: string, body: Json, authHeader: string | undefined): Promise<{ status: number; body: Json }> {
    const err = (status: number, code: number, note: string) => ({ status, body: { error_code: code, error_note: note } });
    let c: ActiveConfig;
    try { c = await this.require('CLICK'); } catch { return err(404, -500, "Emulyator o'chirilgan"); }
    const [user, digest, ts] = String(authHeader ?? '').split(':');
    const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
    if (user !== c.settings.merchantUserId || !ts || !fresh || !digest || !safeEq(digest, sha1(ts + (c.secrets.secretKey ?? '')))) return err(401, -1, 'Auth failed');
    const okBody = (b: Json) => ({ status: 200, body: { error_code: 0, error_note: '', ...b } });
    if (method === 'POST' && path === '/card_token/request') {
      const t = testCard(String(body.card_number ?? ''), String(body.expire_date ?? ''));
      if (!t) return err(400, -5002, "Karta raqami yoki muddati noto'g'ri (emulyator faqat sinov kartalarini qabul qiladi)");
      const token = pack('emu:click:card', { n: `${t.number.slice(0, 4)} ${t.number.slice(4, 6)}** **** ${t.number.slice(-4)}`, e: t.expire, v: 0 } satisfies CardClaims);
      return okBody({ card_token: token, phone_number: PHONE_MASK, temporary: Number(body.temporary ?? 0) });
    }
    if (method === 'POST' && path === '/card_token/verify') {
      const claims = unpack<CardClaims>('emu:click:card', body.card_token);
      if (!claims) return err(400, -5001, 'Karta topilmadi');
      if (String(body.sms_code ?? '') !== TEST_SMS_CODE) return err(400, -5004, "SMS kod noto'g'ri");
      return okBody({ card_number: claims.n });
    }
    if (method === 'POST' && path === '/card_token/payment') {
      if (!unpack<CardClaims>('emu:click:card', body.card_token)) return err(400, -5001, 'Karta topilmadi');
      const amount = soumToTiyin(String(body.amount ?? ''));
      if (amount === null || amount <= 0n) return err(400, -2, "Noto'g'ri summa");
      // Click karta tokeni bilan to'lovda ham merchant'ning SHOP API'sini (Prepare/Complete) chaqiradi
      const paymentId = String(crypto.randomInt(1_000_000_000, 2_000_000_000));
      const r = await this.click(c, String(body.transaction_parameter ?? ''), amount, 'pay', paymentId);
      if (!r.ok) return err(400, -5017, r.steps.filter((s) => !s.ok).map((s) => `${s.name} ${s.detail}`).join('; ') || r.message);
      return okBody({ payment_id: Number(paymentId), payment_status: 2 });
    }
    if (method === 'DELETE' && path.startsWith('/card_token/')) return okBody({});
    return err(404, -3, 'Method not found');
  }
}

function done(steps: Step[], ok: boolean, message: string): EmulatorResult { return { ok, message, steps }; }
function brief(v: unknown) {
  if (!v || typeof v !== 'object') return '';
  const o = v as Json;
  const keys = ['state', 'allow', 'transaction', 'providerTrnId', 'transactionState', 'status'].filter((k) => k in o);
  return keys.map((k) => `${k}=${String(o[k])}`).join(' ');
}
