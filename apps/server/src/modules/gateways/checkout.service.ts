import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  type CatalogProject, type CheckoutCreateInput, type CheckoutQuote, type PayStartResult, subscriptionCreateSchema,
} from '@ads/contracts';
import { AuditService } from '../../platform/audit.service.js';
import { Db } from '../../platform/db.service.js';
import { badRequest, conflict } from '../../platform/errors.js';
import { SequenceService } from '../../platform/sequence.service.js';
import { dbDate, fromDbDate, todayLocal, yearOf } from '../../platform/time.js';
import { type ItemSpec, itemLines, periodBounds, sumLines } from '../billing/helpers.js';
import { PaymentsService } from '../billing/payments.service.js';
import { SubscriptionsService } from '../billing/subscriptions.service.js';
import { CaptureService } from './capture.service.js';
import type { CardOwner } from './cards.service.js';
import { PaymentOrdersService } from './orders.service.js';
import { PayService } from './pay.service.js';

const LIVE = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;

/**
 * Mijozning o'zi obuna bo'lishi: katalog → summa (billing bilan aynan bir xil formula) → buyurtma → onlayn to'lov.
 * Obuna FAQAT to'lov tushgach yaratiladi; to'lov avval aynan shu obuna invoice'iga yo'naltiriladi.
 */
@Injectable()
export class CheckoutService implements OnModuleInit {
  private readonly log = new Logger('Checkout');
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly seq: SequenceService, private readonly orders: PaymentOrdersService,
    private readonly pay: PayService, private readonly subs: SubscriptionsService, private readonly payments: PaymentsService, private readonly capture: CaptureService,
  ) {}

  onModuleInit() {
    this.capture.onPaid('CHECKOUT', async (orderId, paymentId) => {
      const co = await this.db.checkoutOrder.findFirst({ where: { paymentOrderId: orderId } });
      if (co) await this.fulfill(co.id, paymentId);
    });
  }

  async catalog(clientId: string): Promise<CatalogProject[]> {
    const today = dbDate(todayLocal());
    const plans = await this.db.plan.findMany({
      where: { isPublic: true, isActive: true, project: { deletedAt: null } },
      include: { project: true, prices: { where: { currency: 'UZS', validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gt: today } }] } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const live = await this.db.subscription.findMany({ where: { clientId, status: { in: [...LIVE] } }, select: { clientProject: { select: { projectId: true } } } });
    const subscribed = new Set(live.map((s) => s.clientProject.projectId));
    const out = new Map<string, CatalogProject>();
    for (const p of plans) {
      if (!p.prices.length) continue;
      const proj = out.get(p.projectId) ?? out.set(p.projectId, { projectId: p.projectId, name: p.project.name, description: p.project.description, plans: [] }).get(p.projectId)!;
      proj.plans.push({
        planId: p.id, code: p.code, name: p.name, description: p.description, features: p.features ?? [], intervalMonths: p.intervalMonths,
        prices: p.prices.map((x) => ({ planPriceId: x.id, currency: x.currency, unitAmountMinor: x.unitAmountMinor.toString() })), subscribed: subscribed.has(p.projectId),
      });
    }
    return [...out.values()];
  }

  /** Tanlangan narxlar → billing ItemSpec (faqat ochiq, faol, UZS, bitta loyiha va bitta davr). */
  private async specs(items: { planPriceId: string; quantity: number }[], at: string) {
    if (new Set(items.map((i) => i.planPriceId)).size !== items.length) throw badRequest('Bir xil tarif ikki marta tanlangan');
    const prices = await this.db.planPrice.findMany({ where: { id: { in: items.map((i) => i.planPriceId) } }, include: { plan: true } });
    const byId = new Map(prices.map((p) => [p.id, p]));
    const specs = items.map((i): ItemSpec => {
      const p = byId.get(i.planPriceId);
      if (!p || !p.plan.isPublic || !p.plan.isActive) throw badRequest('Tarif katalogda mavjud emas');
      if (p.currency !== 'UZS') throw badRequest("Onlayn to'lov faqat so'mdagi tariflar uchun");
      const from = fromDbDate(p.validFrom)!; const to = fromDbDate(p.validTo);
      if (from > at || (to && to <= at)) throw badRequest(`"${p.plan.name}" narxi amalda emas`);
      return {
        planPriceId: p.id, quantity: i.quantity, unitAmountMinor: p.unitAmountMinor, discountBp: 0, vatRateBp: p.vatRateBp,
        planName: p.plan.name, planCode: p.plan.code, intervalMonths: p.plan.intervalMonths, ikpuCode: p.ikpuCode, packageCode: p.packageCode,
      };
    });
    if (new Set(prices.map((p) => p.plan.projectId)).size > 1) throw badRequest('Bitta buyurtmada bitta xizmat (loyiha) tariflari bo\'lishi kerak');
    if (new Set(specs.map((s) => s.intervalMonths)).size > 1) throw badRequest("Oylik va yillik tariflarni bitta buyurtmada aralashtirib bo'lmaydi");
    return { specs, projectId: prices[0]!.plan.projectId };
  }

  async quote(items: { planPriceId: string; quantity: number }[]): Promise<CheckoutQuote & { projectId: string; specs: ItemSpec[] }> {
    const start = todayLocal();
    const { specs, projectId } = await this.specs(items, start);
    const interval = specs[0]!.intervalMonths;
    const { end, num, den, partial } = periodBounds(start, interval);
    const lines = itemLines(specs, { type: partial ? 'PRORATION' : 'SUBSCRIPTION', num, den, periodStart: start, periodEnd: end, label: '' });
    const next = itemLines(specs, { type: 'SUBSCRIPTION', num: 1, den: 1, periodStart: end, periodEnd: null, label: '' });
    return {
      projectId, specs, currency: 'UZS', intervalMonths: interval, startDate: start, amountMinor: sumLines(lines).total.toString(), periodStart: start, periodEnd: end, partial,
      nextBillingOn: end, nextAmountMinor: sumLines(next).total.toString(),
      lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, amountMinor: l.amountMinor.toString() })),
    };
  }

  async create(o: CardOwner, input: CheckoutCreateInput): Promise<PayStartResult> {
    const q = await this.quote(input.items);
    const live = await this.db.subscription.count({ where: { clientId: o.clientId, status: { in: [...LIVE] }, clientProject: { projectId: q.projectId } } });
    if (live) throw conflict("Bu xizmatga obunangiz bor — tarifni o'zgartirish uchun «Murojaatlar» orqali so'rov yuboring");
    const amount = BigInt(q.amountMinor);
    const provider = input.method === 'CARD' ? await this.pay.cardProvider(input.cardId!, o.clientId) : input.method;
    const { order, checkoutId } = await this.db.$transaction(async (tx) => {
      const order = await this.orders.createFixed(tx, {
        clientId: o.clientId, amountMinor: amount, purpose: 'CHECKOUT', provider, cardId: input.method === 'CARD' ? input.cardId : null, portalUserId: o.portalUserId,
      });
      const code = await this.seq.code(tx, 'BUY', { year: yearOf(q.startDate), width: 5 });
      const co = await tx.checkoutOrder.create({
        data: {
          code, clientId: o.clientId, portalUserId: o.portalUserId, projectId: q.projectId, currency: 'UZS', items: input.items, intervalMonths: q.intervalMonths,
          startDate: dbDate(q.startDate), amountMinor: amount, paymentOrderId: order.id, expiresAt: order.expiresAt,
        },
      });
      await this.audit.record(tx, { action: 'checkout.created', resourceType: 'client', resourceId: o.clientId, metadata: { code, orderId: order.id, amountMinor: amount.toString(), interval: q.intervalMonths, method: input.method } });
      return { order, checkoutId: co.id };
    });
    try {
      const r = await this.pay.start(order, input.method, { clientId: o.clientId, cardId: input.cardId });
      return { ...r, checkoutId };
    } catch (e) {
      await this.db.checkoutOrder.updateMany({ where: { id: checkoutId, status: 'PENDING' }, data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) } });
      throw e;
    }
  }

  /** To'lov tushgach: (kerak bo'lsa) mijoz–loyiha bog'lanishi → obuna → birinchi invoice → to'lovni shu invoice'ga yo'naltirish. Idempotent. */
  async fulfill(checkoutId: string, paymentId?: string) {
    const co = await this.db.checkoutOrder.findUnique({ where: { id: checkoutId } });
    if (!co || co.status !== 'PAID') return;
    try {
      let cp = await this.db.clientProject.findFirst({ where: { clientId: co.clientId, projectId: co.projectId } });
      if (!cp) {
        cp = await this.db.$transaction(async (tx) => {
          const x = await tx.clientProject.create({ data: { clientId: co.clientId, projectId: co.projectId, status: 'ONBOARDING' } });
          await this.audit.record(tx, { action: 'client_project.linked', resourceType: 'client', resourceId: co.clientId, metadata: { projectId: co.projectId, via: 'checkout', checkout: co.code } });
          return x;
        });
      } else if (cp.status === 'CHURNED' || cp.status === 'SUSPENDED') {
        cp = await this.db.clientProject.update({ where: { id: cp.id }, data: { status: 'ONBOARDING', rowVersion: { increment: 1 } } });
      }
      let subscriptionId = co.subscriptionId;
      if (!subscriptionId) {
        const existing = await this.db.subscription.findFirst({ where: { clientProjectId: cp.id, status: { in: [...LIVE] } } });
        if (existing) throw new Error(`mijozda bu loyiha bo'yicha faol obuna bor (${existing.code})`);
        const r = await this.subs.create(subscriptionCreateSchema.parse({
          clientProjectId: cp.id, currency: co.currency, startDate: fromDbDate(co.startDate), items: (co.items as { planPriceId: string; quantity: number }[]),
        }), { autoAllocate: false });
        subscriptionId = r.id;
        await this.db.checkoutOrder.update({ where: { id: co.id }, data: { subscriptionId } });
      }
      const pid = paymentId ?? (await this.db.payment.findFirst({ where: { gatewayTransaction: { paymentOrderId: co.paymentOrderId ?? '', state: 'SUCCEEDED' } }, select: { id: true } }))?.id;
      const invoices = await this.db.invoice.findMany({ where: { subscriptionId, status: { in: ['OPEN', 'UNCOLLECTIBLE'] } }, select: { id: true } });
      if (pid) await this.payments.allocateToInvoices(pid, invoices.map((i) => i.id));
      await this.db.$transaction(async (tx) => {
        await tx.checkoutOrder.update({ where: { id: co.id }, data: { status: 'FULFILLED', fulfilledAt: new Date(), error: null } });
        await this.audit.record(tx, { action: 'checkout.fulfilled', resourceType: 'client', resourceId: co.clientId, metadata: { code: co.code, subscriptionId } });
      });
    } catch (e) {
      const msg = (e as Error).message;
      this.log.error(`checkout ${co.code}: ${msg}`);
      // Parallel urinish (webhook + worker) obunani allaqachon yaratgan bo'lsa — yakunlangan buyurtmaga xato yozilmaydi
      await this.db.checkoutOrder.updateMany({ where: { id: co.id, status: 'PAID' }, data: { error: msg.slice(0, 500) } });
    }
  }
}
