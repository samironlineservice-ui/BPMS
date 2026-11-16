import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@ads/db';
import { GATEWAY_LABELS } from '@ads/contracts';
import { AuditService } from '../../platform/audit.service.js';
import { Db, type DbTx } from '../../platform/db.service.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { SequenceService } from '../../platform/sequence.service.js';
import { localDate, todayLocal, yearOf } from '../../platform/time.js';
import { PaymentsService } from '../billing/payments.service.js';
import { ACCOUNTS, LedgerService } from '../finance/ledger.service.js';
import { CLEARING_ACCOUNT, type ProviderKey, ProviderError } from './common.js';

type Hook = (orderId: string, paymentId: string) => Promise<void>;

/**
 * Provayder tasdiqlagan to'lovni qayd etish. Barchasi BITTA tranzaksiyada: tranzaksiya holati + Payment (POSTED) +
 * ledger (Dt clearing / Kt 2100 avans) + buyurtma holati + audit + outbox. Takroriy chaqiruv xavfsiz (sandbox ham ikki marta yuboradi).
 * Taqsimlash/obuna yaratish — commit'dan keyin (xato bo'lsa pul baribir qayd etilgan, worker qayta urinadi).
 */
@Injectable()
export class CaptureService {
  private readonly log = new Logger('Gateways');
  private readonly hooks = new Map<string, Hook>();

  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly seq: SequenceService,
    private readonly ledger: LedgerService, private readonly payments: PaymentsService,
  ) {}

  /** Buyurtma maqsadi bo'yicha to'lovdan keyingi ish (masalan, CHECKOUT → obuna yaratish). */
  onPaid(purpose: string, fn: Hook) { this.hooks.set(purpose, fn); }

  /** PENDING tranzaksiya (Payme Create, Click Prepare, Uzum create). (provider, externalId) bo'yicha idempotent. */
  async begin(d: { provider: ProviderKey; externalId: string; orderId: string; orderKind: 'FIXED' | 'OPEN_TOPUP'; amountMinor: bigint; providerTime: Date }) {
    const existing = await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: d.provider, externalId: d.externalId } } });
    if (existing) return { tx: existing, created: false };
    try {
      const tx = await this.db.gatewayTransaction.create({
        data: { provider: d.provider, externalId: d.externalId, paymentOrderId: d.orderId, orderKind: d.orderKind, amountMinor: d.amountMinor, providerTime: d.providerTime },
      });
      return { tx, created: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.db.gatewayTransaction.findUnique({ where: { provider_externalId: { provider: d.provider, externalId: d.externalId } } });
        if (again) return { tx: again, created: false };
        throw new ProviderError('BUSY', "Bu buyurtma bo'yicha boshqa to'lov jarayonda"); // FIXED buyurtmada bitta "tirik" tranzaksiya (DB indeks)
      }
      throw e;
    }
  }

  /** PENDING → SUCCEEDED + to'lov. Allaqachon SUCCEEDED bo'lsa — o'sha natija (idempotent). */
  async succeed(gatewayTxId: string) {
    const r = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM gateway_transactions WHERE id = ${gatewayTxId}::uuid FOR UPDATE`;
      const g = await tx.gatewayTransaction.findUniqueOrThrow({ where: { id: gatewayTxId }, include: { paymentOrder: true, payment: true } });
      if (g.state === 'SUCCEEDED') return { g, paymentId: g.payment?.id ?? null, fresh: false };
      if (g.state !== 'PENDING') throw new ProviderError('STATE', 'Tranzaksiya bekor qilingan');
      const g2 = await tx.gatewayTransaction.update({ where: { id: g.id }, data: { state: 'SUCCEEDED', performedAt: new Date() } });
      const p = await this.recordPayment(tx, g2, g.paymentOrder);
      return { g: g2, paymentId: p.id, fresh: true };
    }, { timeout: 20_000 });
    if (r.fresh && r.paymentId) this.later(r.g.paymentOrderId, r.paymentId);
    return r.g;
  }

  /** Bir qadamli to'lov (Paynet PerformTransaction): darhol SUCCEEDED. */
  async createSucceeded(d: { provider: ProviderKey; externalId: string; orderId: string; orderKind: 'FIXED' | 'OPEN_TOPUP'; amountMinor: bigint; providerTime: Date }) {
    try {
      const r = await this.db.$transaction(async (tx) => {
        const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: d.orderId } });
        const g = await tx.gatewayTransaction.create({
          data: { provider: d.provider, externalId: d.externalId, paymentOrderId: d.orderId, orderKind: d.orderKind, amountMinor: d.amountMinor, providerTime: d.providerTime, state: 'SUCCEEDED', performedAt: new Date() },
        });
        const p = await this.recordPayment(tx, g, order);
        return { g, paymentId: p.id };
      }, { timeout: 20_000 });
      this.later(r.g.paymentOrderId, r.paymentId);
      return r.g;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ProviderError('BUSY', "Bu buyurtma bo'yicha to'lov allaqachon mavjud");
      throw e;
    }
  }

  async cancel(gatewayTxId: string, reason: number | null) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM gateway_transactions WHERE id = ${gatewayTxId}::uuid FOR UPDATE`;
      const g = await tx.gatewayTransaction.findUniqueOrThrow({ where: { id: gatewayTxId } });
      if (g.state !== 'PENDING') return g;
      const g2 = await tx.gatewayTransaction.update({ where: { id: g.id }, data: { state: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
      await this.audit.record(tx, { action: 'gateway.tx_cancelled', resourceType: 'payment_order', resourceId: g.paymentOrderId, metadata: { provider: g.provider, externalId: g.externalId, reason } });
      return g2;
    });
  }

  private async recordPayment(tx: DbTx, g: { id: string; provider: string; externalId: string; amountMinor: bigint; performedAt: Date | null },
    order: { id: string; number: string; clientId: string; kind: string; purpose: string; cardId: string | null }) {
    const provider = g.provider as ProviderKey;
    const code = await this.seq.code(tx, 'PAY', { year: yearOf(todayLocal()) });
    const p = await tx.payment.create({
      data: {
        code, clientId: order.clientId, method: provider, status: 'POSTED', currency: 'UZS', amountMinor: g.amountMinor, fxRate: '1', amountUzsMinor: g.amountMinor,
        receivedAt: g.performedAt ?? new Date(), gatewayTransactionId: g.id, externalRef: `${provider}:${g.externalId}`.slice(0, 120),
        notes: `${GATEWAY_LABELS[provider]} · buyurtma ${order.number}`,
      },
    });
    await this.ledger.post(tx, {
      key: `payment:${p.id}:post`, date: localDate(p.receivedAt), sourceType: 'payment', sourceId: p.id, description: `${p.code} (${GATEWAY_LABELS[provider]})`,
      lines: [
        { account: CLEARING_ACCOUNT[provider], currency: 'UZS', amountMinor: p.amountMinor, amountUzsMinor: p.amountUzsMinor, clientId: p.clientId },
        { account: ACCOUNTS.ADVANCES, currency: 'UZS', amountMinor: -p.amountMinor, amountUzsMinor: -p.amountUzsMinor, clientId: p.clientId },
      ],
    });
    if (order.kind === 'FIXED') await tx.paymentOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date() } });
    if (order.purpose === 'CHECKOUT') await tx.checkoutOrder.updateMany({ where: { paymentOrderId: order.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date() } });
    if (order.cardId) await tx.paymentCard.update({ where: { id: order.cardId }, data: { lastUsedAt: new Date() } });
    await this.audit.record(tx, {
      action: 'payment.posted', resourceType: 'payment', resourceId: p.id,
      metadata: { code, provider, externalId: g.externalId, amountMinor: p.amountMinor.toString(), order: order.number },
    });
    await this.outbox.add(tx, {
      type: 'payment.posted', eventKey: `payment.posted:${p.id}`, aggregateType: 'payment', aggregateId: p.id,
      payload: { code, clientId: p.clientId, amountMinor: p.amountMinor.toString(), currency: 'UZS', provider },
    });
    return p;
  }

  /** Webhook javobini kechiktirmaslik uchun to'lovdan keyingi ish commit'dan keyin alohida bajariladi (xato bo'lsa — worker qayta urinadi). */
  private later(orderId: string, paymentId: string) {
    setImmediate(() => void this.afterPaid(orderId, paymentId));
  }

  /** To'lovdan keyingi ish: maqsad bo'yicha hook (checkout) yoki tanlangan invoice'larga taqsimlash, qoldig'i — FIFO. */
  async afterPaid(orderId: string, paymentId: string) {
    try {
      const o = await this.db.paymentOrder.findUniqueOrThrow({ where: { id: orderId }, include: { targets: true } });
      const hook = this.hooks.get(o.purpose);
      if (hook) await hook(orderId, paymentId);
      else if (o.targets.length) await this.payments.allocateToInvoices(paymentId, o.targets.map((t) => t.invoiceId));
      else await this.payments.autoAllocate(o.clientId);
    } catch (e) {
      this.log.error(`afterPaid ${orderId}: ${(e as Error).message}`);
    }
  }

  /** Har bir webhook so'rovini jurnalga yozish (xatolar ham). Hech qachon xato tashlamaydi. */
  async logEvent(d: { provider: ProviderKey; method: string; externalId?: string | null; rawBody: string; request: unknown; response: unknown; httpStatus: number; authOk: boolean; ip: string | null; ms: number }) {
    try {
      const redact = (v: unknown) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (/(password|secret|key|token|sign|card_number|expire)/i.test(k) ? '[REDACTED]' : x)));
      await this.db.gatewayEvent.create({
        data: {
          provider: d.provider, method: d.method.slice(0, 60), externalId: d.externalId ?? null, rawBody: d.rawBody.slice(0, 20_000).replace(/("?(?:card_number|cardNumber|password)"?\s*[:=]\s*"?)[^"&,}]+/gi, '$1[REDACTED]'),
          request: redact(d.request), response: redact(d.response), httpStatus: d.httpStatus, authOk: d.authOk, sourceIp: d.ip, durationMs: d.ms,
        },
      });
    } catch (e) {
      this.log.warn(`gateway event log: ${(e as Error).message}`);
    }
  }
}
