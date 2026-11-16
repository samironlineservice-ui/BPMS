import { Injectable } from '@nestjs/common';
import type { PaymentOrderStatusDto } from '@ads/contracts';
import { luhnNumber } from '../../platform/crypto.js';
import { Db, type DbOrTx } from '../../platform/db.service.js';
import { badRequest, notFound } from '../../platform/errors.js';
import { ACCOUNT_NO, MIN_TOPUP, ORDER_NO, type ProviderKey } from './common.js';

const orderInclude = { client: { select: { id: true, displayName: true, legalName: true, accountNo: true, deletedAt: true } } } as const;
export type Purpose = 'CHECKOUT' | 'INVOICES' | 'AUTOPAY';

/** To'lov buyurtmasi: FIXED — aniq summa (checkout, invoice'lar); OPEN_TOPUP — mijozning shaxsiy hisob raqami bo'yicha istalgan summa. */
@Injectable()
export class PaymentOrdersService {
  constructor(private readonly db: Db) {}

  async createFixed(tx: DbOrTx, d: {
    clientId: string; amountMinor: bigint; purpose: Purpose; provider?: ProviderKey | null; cardId?: string | null; portalUserId?: string | null;
    targets?: { invoiceId: string; amountMinor: bigint; amountUzsMinor?: bigint }[]; returnPath?: string | null; ttlHours?: number;
  }) {
    if (d.amountMinor <= 0n) throw badRequest("To'lov summasi musbat bo'lishi kerak");
    let number = luhnNumber(12);
    for (let i = 0; i < 5 && (await tx.paymentOrder.findUnique({ where: { number } })); i++) number = luhnNumber(12);
    const o = await tx.paymentOrder.create({
      data: {
        number, kind: 'FIXED', purpose: d.purpose, clientId: d.clientId, amountMinor: d.amountMinor, provider: d.provider ?? null, cardId: d.cardId ?? null,
        portalUserId: d.portalUserId ?? null, returnPath: d.returnPath ?? null, expiresAt: new Date(Date.now() + (d.ttlHours ?? 24) * 3_600_000),
      },
    });
    if (d.targets?.length) {
      await tx.paymentOrderTarget.createMany({
        data: d.targets.map((t) => ({ orderId: o.id, invoiceId: t.invoiceId, clientId: d.clientId, amountInvoiceMinor: t.amountMinor, amountUzsMinor: t.amountUzsMinor ?? t.amountMinor })),
      });
    }
    return o;
  }

  /** Mijozning doimiy "hisobni to'ldirish" buyurtmasi (Paynet, Payme/Click/Uzum ilovalarida shaxsiy hisob raqami bilan to'lash). */
  async topupOrder(clientId: string) {
    const ex = await this.db.paymentOrder.findFirst({ where: { clientId, kind: 'OPEN_TOPUP' }, orderBy: { createdAt: 'asc' } });
    if (ex) return ex;
    let number = luhnNumber(10);
    for (let i = 0; i < 5 && (await this.db.paymentOrder.findUnique({ where: { number } })); i++) number = luhnNumber(10);
    return this.db.paymentOrder.create({
      data: { number, kind: 'OPEN_TOPUP', purpose: 'TOPUP', clientId, amountMinor: null, expiresAt: new Date(Date.now() + 100 * 365 * 86_400_000) },
    });
  }

  /** Provayder yuborgan hisob identifikatori → buyurtma (10–12 raqam) yoki mijoz shaxsiy hisobi (8 raqam). */
  async resolve(account: unknown) {
    const v = String(account ?? '').trim();
    if (ORDER_NO.test(v)) {
      const o = await this.db.paymentOrder.findUnique({ where: { number: v }, include: orderInclude });
      return o && !o.client.deletedAt ? o : null;
    }
    if (ACCOUNT_NO.test(v)) {
      const c = await this.db.client.findFirst({ where: { accountNo: v, deletedAt: null } });
      if (!c) return null;
      const t = await this.topupOrder(c.id);
      return this.db.paymentOrder.findUniqueOrThrow({ where: { id: t.id }, include: orderInclude });
    }
    return null;
  }

  /** To'lash mumkinmi: null — mumkin; aks holda sabab. */
  payable(o: { kind: string; status: string; amountMinor: bigint | null; expiresAt: Date }, amount: bigint): 'AMOUNT' | 'PAID' | 'CLOSED' | null {
    if (o.kind === 'OPEN_TOPUP') return amount >= MIN_TOPUP ? null : 'AMOUNT';
    if (o.status === 'PAID') return 'PAID';
    if (o.status !== 'PENDING' || o.expiresAt < new Date()) return 'CLOSED';
    return o.amountMinor === amount ? null : 'AMOUNT';
  }

  async status(orderId: string, clientId: string): Promise<PaymentOrderStatusDto> {
    const o = await this.db.paymentOrder.findFirst({ where: { id: orderId, clientId }, include: { checkout: true } });
    if (!o) throw notFound("To'lov buyurtmasi");
    return {
      id: o.id, number: o.number, purpose: o.purpose, status: o.status, provider: o.provider, amountMinor: o.amountMinor?.toString() ?? null,
      paidAt: o.paidAt?.toISOString() ?? null, failure: o.failure,
      checkout: o.checkout ? { id: o.checkout.id, code: o.checkout.code, status: o.checkout.status, subscriptionId: o.checkout.subscriptionId } : null,
    };
  }
}
