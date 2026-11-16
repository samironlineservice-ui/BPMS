import { Injectable } from '@nestjs/common';
import type { PaymentCardDto } from '@ads/contracts';
import { AuditService } from '../../platform/audit.service.js';
import { decrypt, encrypt, KEY_VERSION } from '../../platform/crypto.js';
import { Db } from '../../platform/db.service.js';
import { AppError, badRequest, notFound } from '../../platform/errors.js';
import { ProviderError, tiyinToSoum } from './common.js';
import { GatewayConfigService } from './config.service.js';
import { ClickService } from './providers/click.js';
import { PaymeService } from './providers/payme.js';

export interface CardOwner { clientId: string; portalUserId: string | null }
const cardType = (pan: string) => (pan.startsWith('8600') ? 'UZCARD' : pan.startsWith('9860') ? 'HUMO' : pan.startsWith('4') ? 'VISA' : pan.startsWith('5') ? 'MASTERCARD' : null);
const mask = (pan: string) => `${pan.slice(0, 4)} ${pan.slice(4, 6)}** **** ${pan.slice(-4)}`;
/** Provayder xatosi → mijozga tushunarli 400; tarmoq/timeout → 502. */
async function viaProvider<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (e instanceof ProviderError) throw badRequest(e.message, 'GATEWAY_REJECTED');
    if (e instanceof TypeError || (e as Error).name === 'TimeoutError') throw new AppError(502, 'GATEWAY_UNAVAILABLE', "To'lov tizimi javob bermadi — birozdan so'ng qayta urinib ko'ring");
    throw e;
  }
}

/** Saqlangan kartalar: faqat provayder tokeni (shifrlangan) + niqoblangan raqam. Karta raqami saqlanmaydi va logga yozilmaydi. */
@Injectable()
export class CardsService {
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly config: GatewayConfigService,
    private readonly payme: PaymeService, private readonly click: ClickService,
  ) {}

  private dto(c: { id: string; provider: string; maskedPan: string; expire: string; cardType: string | null; status: string; isDefault: boolean; autopay: boolean; createdAt: Date; lastUsedAt: Date | null; phoneMask: string | null }): PaymentCardDto {
    return {
      id: c.id, provider: c.provider, maskedPan: c.maskedPan, expire: c.expire, cardType: c.cardType, status: c.status, isDefault: c.isDefault, autopay: c.autopay,
      createdAt: c.createdAt.toISOString(), lastUsedAt: c.lastUsedAt?.toISOString() ?? null, phoneMask: c.phoneMask,
    };
  }

  async list(clientId: string) {
    const rows = await this.db.paymentCard.findMany({ where: { clientId, status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    return rows.map((c) => this.dto(c));
  }

  private async hasDefault(clientId: string) {
    return (await this.db.paymentCard.count({ where: { clientId, status: 'ACTIVE', isDefault: true } })) > 0;
  }

  /** Payme: karta front-end'da (to'g'ridan-to'g'ri Payme'ga) qo'shilgan va SMS bilan tasdiqlangan — server tokenni Payme'dan tekshiradi. */
  async savePayme(o: CardOwner, token: string) {
    const c = await this.config.active('PAYME');
    const r = await viaProvider(() => this.payme.subscribe<{ card: { number: string; expire: string; token: string; recurrent?: boolean; verify?: boolean } }>(c, 'cards.check', { token }));
    if (!r.card?.verify) throw badRequest('Karta SMS kod bilan tasdiqlanmagan');
    if (r.card.recurrent === false) throw badRequest("Bu karta takroriy to'lovni qo'llamaydi");
    const digits = r.card.number.replace(/[^\d*]/g, '');
    const isDefault = !(await this.hasDefault(o.clientId));
    const card = await this.db.$transaction(async (tx) => {
      const x = await tx.paymentCard.create({
        data: {
          clientId: o.clientId, portalUserId: o.portalUserId, provider: 'PAYME', tokenEnc: encrypt(token), keyVersion: KEY_VERSION, maskedPan: r.card.number.includes('*') ? r.card.number : mask(digits),
          expire: normExpire(r.card.expire), cardType: cardType(digits), status: 'ACTIVE', verifiedAt: new Date(), isDefault,
        },
      });
      await this.audit.record(tx, { action: 'payment_card.added', resourceType: 'client', resourceId: o.clientId, metadata: { cardId: x.id, provider: 'PAYME', maskedPan: x.maskedPan } });
      return x;
    });
    return this.dto(card);
  }

  /** Click: karta ma'lumoti faqat Click'ga uzatiladi (saqlanmaydi). Javob: SMS yuborilgan telefon. */
  async clickRequest(o: CardOwner, cardNumber: string, expire: string) {
    const c = await this.config.active('CLICK');
    const recent = await this.db.paymentCard.count({ where: { clientId: o.clientId, provider: 'CLICK', status: 'PENDING', createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent >= 5) throw badRequest("Juda ko'p urinish — bir soatdan so'ng qayta urinib ko'ring");
    const r = await viaProvider(() => this.click.merchant<{ card_token: string; phone_number?: string; error_code?: number }>(c, 'POST', '/card_token/request', {
      service_id: Number(c.settings.serviceId), card_number: cardNumber, expire_date: expire, temporary: 0,
    }));
    const card = await this.db.paymentCard.create({
      data: {
        clientId: o.clientId, portalUserId: o.portalUserId, provider: 'CLICK', tokenEnc: encrypt(r.card_token), keyVersion: KEY_VERSION, maskedPan: mask(cardNumber),
        expire: `${expire.slice(0, 2)}/${expire.slice(2, 4)}`, cardType: cardType(cardNumber), phoneMask: r.phone_number ?? null, status: 'PENDING',
      },
    });
    return { cardId: card.id, phoneMask: card.phoneMask };
  }

  async clickVerify(o: CardOwner, cardId: string, smsCode: string) {
    const card = await this.db.paymentCard.findFirst({ where: { id: cardId, clientId: o.clientId, provider: 'CLICK', status: 'PENDING' } });
    if (!card) throw notFound('Karta');
    const c = await this.config.active('CLICK');
    await viaProvider(() => this.click.merchant(c, 'POST', '/card_token/verify', { service_id: Number(c.settings.serviceId), card_token: decrypt(card.tokenEnc), sms_code: Number(smsCode) }));
    const isDefault = !(await this.hasDefault(o.clientId));
    const done = await this.db.$transaction(async (tx) => {
      const x = await tx.paymentCard.update({ where: { id: card.id }, data: { status: 'ACTIVE', verifiedAt: new Date(), isDefault } });
      await this.audit.record(tx, { action: 'payment_card.added', resourceType: 'client', resourceId: o.clientId, metadata: { cardId: x.id, provider: 'CLICK', maskedPan: x.maskedPan } });
      return x;
    });
    return this.dto(done);
  }

  /** Asosiy karta / avtomatik to'lov: mijozda bittadan (DB indeks ham kafolatlaydi). */
  async update(o: CardOwner, cardId: string, input: { isDefault?: boolean; autopay?: boolean }) {
    const card = await this.db.paymentCard.findFirst({ where: { id: cardId, clientId: o.clientId, status: 'ACTIVE' } });
    if (!card) throw notFound('Karta');
    await this.db.$transaction(async (tx) => {
      if (input.isDefault) await tx.paymentCard.updateMany({ where: { clientId: o.clientId, isDefault: true, id: { not: cardId } }, data: { isDefault: false } });
      if (input.autopay) await tx.paymentCard.updateMany({ where: { clientId: o.clientId, autopay: true, id: { not: cardId } }, data: { autopay: false } });
      await tx.paymentCard.update({ where: { id: cardId }, data: { ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}), ...(input.autopay !== undefined ? { autopay: input.autopay } : {}) } });
      await this.audit.record(tx, { action: 'payment_card.updated', resourceType: 'client', resourceId: o.clientId, metadata: { cardId, ...input } });
    });
    return { ok: true };
  }

  async remove(o: CardOwner, cardId: string) {
    const card = await this.db.paymentCard.findFirst({ where: { id: cardId, clientId: o.clientId, status: { not: 'REMOVED' } } });
    if (!card) throw notFound('Karta');
    try { // provayderdagi tokenni ham o'chirishga urinamiz (bo'lmasa ham karta bizda o'chiriladi)
      if (card.provider === 'PAYME') await this.payme.subscribe(await this.config.active('PAYME'), 'cards.remove', { token: decrypt(card.tokenEnc) });
      if (card.provider === 'CLICK') { const c = await this.config.active('CLICK'); await this.click.merchant(c, 'DELETE', `/card_token/${c.settings.serviceId}/${decrypt(card.tokenEnc)}`); }
    } catch { /* provayder xatosi — mahalliy o'chirishga to'sqinlik qilmaydi */ }
    await this.db.$transaction(async (tx) => {
      await tx.paymentCard.update({ where: { id: card.id }, data: { status: 'REMOVED', removedAt: new Date(), isDefault: false, autopay: false } });
      await this.audit.record(tx, { action: 'payment_card.removed', resourceType: 'client', resourceId: o.clientId, metadata: { cardId, maskedPan: card.maskedPan } });
    });
    return { ok: true };
  }

  /** Saqlangan karta bilan FIXED buyurtmani to'lash. Payme: receipts.create + receipts.pay (Payme Merchant API orqali bizga qaytadi). */
  async charge(cardId: string, clientId: string, order: { id: string; number: string; amountMinor: bigint | null }) {
    const card = await this.db.paymentCard.findFirst({ where: { id: cardId, clientId, status: 'ACTIVE' } });
    if (!card) throw notFound('Karta');
    const token = decrypt(card.tokenEnc);
    const amount = order.amountMinor ?? 0n;
    try {
      if (card.provider === 'PAYME') {
        const c = await this.config.active('PAYME');
        const field = c.settings.accountField || 'order_id';
        const rc = await this.payme.subscribe<{ receipt: { _id: string } }>(c, 'receipts.create', { amount: Number(amount), account: { [field]: order.number }, description: `ADS · buyurtma ${order.number}` });
        const rp = await this.payme.subscribe<{ receipt: { state: number } }>(c, 'receipts.pay', { id: rc.receipt._id, token });
        if (rp.receipt.state !== 4) throw new ProviderError('PAY', "To'lov yakunlanmadi");
      } else if (card.provider === 'CLICK') {
        // Click karta tokeni bilan yechgach, buyurtmani SHOP API callback'lari (Prepare/Complete) orqali yopadi —
        // pulni faqat callback qayd etadi (ikki marta yozilish xavfi yo'q)
        const c = await this.config.active('CLICK');
        await this.click.merchant<{ payment_id?: string | number; payment_status?: number; error_code?: number }>(c, 'POST', '/card_token/payment', {
          service_id: Number(c.settings.serviceId), card_token: token, amount: Number(tiyinToSoum(amount)), transaction_parameter: order.number,
        });
      } else {
        throw new ProviderError('UNSUPPORTED', "Bu karta turi bilan to'lov qo'llanmaydi");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.db.paymentOrder.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED', failure: msg.slice(0, 300) } });
      throw badRequest(`Karta bilan to'lov amalga oshmadi: ${msg}`);
    }
    return this.waitSettled(order.id);
  }

  /** Provayder callback'i buyurtmani yopishini qisqa kutish. PENDING qaytsa — kabinet holatni o'zi kuzatadi. */
  private async waitSettled(orderId: string, ms = 8_000) {
    const until = Date.now() + ms;
    for (;;) {
      const o = await this.db.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (o.status !== 'PENDING' || Date.now() > until) return o;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/** "03/99" | "0399" | "9903" → "MM/YY" */
function normExpire(e: string) {
  const d = (e ?? '').replace(/\D/g, '');
  if (/^\d{4}$/.test(d)) { const mm = Number(d.slice(0, 2)); return mm >= 1 && mm <= 12 ? `${d.slice(0, 2)}/${d.slice(2)}` : `${d.slice(2)}/${d.slice(0, 2)}`; }
  return '00/00';
}
