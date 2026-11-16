import { Injectable } from '@nestjs/common';
import { convertMinor, GATEWAY_LABELS, type InvoicePayInput, type PayMethodsDto, type PayStartResult } from '@ads/contracts';
import { env } from '../../config/env.js';
import { AuditService } from '../../platform/audit.service.js';
import { Db } from '../../platform/db.service.js';
import { badRequest, notFound } from '../../platform/errors.js';
import { todayLocal } from '../../platform/time.js';
import { FxService } from '../finance/fx.service.js';
import { CardsService, type CardOwner } from './cards.service.js';
import type { ProviderKey } from './common.js';
import { GatewayConfigService } from './config.service.js';
import { PaymentOrdersService } from './orders.service.js';
import { ClickService } from './providers/click.js';
import { PaymeService } from './providers/payme.js';

type Method = 'PAYME' | 'CLICK' | 'UZUM' | 'CARD';
type OrderRow = { id: string; number: string; amountMinor: bigint | null };

/** To'lovni boshlash: provayder sahifasiga yo'naltirish yoki saqlangan karta bilan darhol to'lash. */
@Injectable()
export class PayService {
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly config: GatewayConfigService, private readonly orders: PaymentOrdersService,
    private readonly payme: PaymeService, private readonly click: ClickService, private readonly cards: CardsService, private readonly fx: FxService,
  ) {}

  async methods(clientId: string): Promise<PayMethodsDto> {
    const list = await this.config.enabledList();
    const client = await this.db.client.findUniqueOrThrow({ where: { id: clientId } });
    const payme = list.find((c) => c.provider === 'PAYME');
    return {
      providers: list.filter((c) => c.provider !== 'PAYNET').map((c) => ({ key: c.provider, label: GATEWAY_LABELS[c.provider]!, mode: c.mode, cards: c.provider === 'PAYME' || c.provider === 'CLICK' })),
      topup: { accountNo: client.accountNo, providers: list.map((c) => c.provider) },
      ...(payme ? { paymeCards: { endpoint: this.payme.subscribeEndpoint(payme), merchantId: payme.merchantId } } : {}),
    };
  }

  /** Karta bilan to'lashda buyurtma qaysi provayder orqali o'tishini oldindan bilish uchun. */
  async cardProvider(cardId: string, clientId: string): Promise<ProviderKey> {
    const c = await this.db.paymentCard.findFirst({ where: { id: cardId, clientId, status: 'ACTIVE' }, select: { provider: true } });
    if (!c) throw notFound('Karta');
    return c.provider as ProviderKey;
  }

  async start(order: OrderRow, method: Method, owner: { clientId: string; cardId?: string | null }): Promise<PayStartResult> {
    if (method === 'CARD') {
      const done = await this.cards.charge(owner.cardId!, owner.clientId, order);
      return { orderId: order.id, number: order.number, status: done.status, redirectUrl: null };
    }
    const c = await this.config.active(method);
    const redirectUrl = method === 'PAYME' ? this.payme.checkoutUrl(c, order)
      : method === 'CLICK' ? this.click.payUrl(c, order)
        : c.mode === 'EMULATOR' ? `${env.PORTAL_ORIGIN}/pay/emulator/${order.id}?provider=UZUM` : `${env.PORTAL_ORIGIN}/pay/result/${order.id}?app=UZUM`; // Uzum: ilovada buyurtma raqami bilan
    return { orderId: order.id, number: order.number, status: 'PENDING', redirectUrl };
  }

  /** Kabinetdan tanlangan invoice'larni to'lash. USD invoice — so'mda, bugungi MB kursi bo'yicha (butun so'mga yuqoriga yaxlitlab). */
  async payInvoices(o: CardOwner, input: InvoicePayInput, purpose: 'INVOICES' | 'AUTOPAY' = 'INVOICES'): Promise<PayStartResult> {
    const ids = [...new Set(input.invoiceIds)];
    const invoices = await this.db.invoice.findMany({ where: { id: { in: ids }, clientId: o.clientId, status: { in: ['OPEN', 'UNCOLLECTIBLE'] } } });
    if (invoices.length !== ids.length) throw badRequest("Tanlangan invoice'lar to'lanmagan yoki topilmadi");
    let rate: { scaled: bigint } | null = null;
    const targets: { invoiceId: string; amountMinor: bigint; uzs: bigint }[] = [];
    for (const inv of invoices) {
      const out = inv.totalMinor - inv.paidMinor - inv.creditedMinor;
      if (out <= 0n) continue;
      let uzs = out;
      if (inv.currency === 'USD') {
        rate ??= await this.fx.requireRate(todayLocal());
        uzs = ((convertMinor(out, rate.scaled) + 99n) / 100n) * 100n;
      }
      targets.push({ invoiceId: inv.id, amountMinor: out, uzs });
    }
    if (!targets.length) throw badRequest("To'lanadigan summa yo'q");
    const total = targets.reduce((s, t) => s + t.uzs, 0n);
    const provider = input.method === 'CARD' ? await this.cardProvider(input.cardId!, o.clientId) : input.method;
    const order = await this.db.$transaction(async (tx) => {
      const x = await this.orders.createFixed(tx, {
        clientId: o.clientId, amountMinor: total, purpose, provider, cardId: input.method === 'CARD' ? input.cardId : null, portalUserId: o.portalUserId,
        targets: targets.map((t) => ({ invoiceId: t.invoiceId, amountMinor: t.amountMinor, amountUzsMinor: t.uzs })),
      });
      await this.audit.record(tx, { action: 'pay_order.created', resourceType: 'client', resourceId: o.clientId, metadata: { orderId: x.id, number: x.number, invoices: targets.length, amountMinor: total.toString(), method: input.method, purpose } });
      return x;
    });
    return this.start(order, input.method, { clientId: o.clientId, cardId: input.cardId });
  }
}
