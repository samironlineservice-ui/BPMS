import { Injectable } from '@nestjs/common';
import {
  type AllocateInput, convertMinor, mulDivRound, parseMoney, parseRate, type PaymentRecordInput, RATE_SCALE, rateToString,
} from '@ads/contracts';
import type { Invoice, Payment } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db, type DbOrTx, type DbTx } from '../../platform/db.service.js';
import { badRequest, conflict, notFound } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { SequenceService } from '../../platform/sequence.service.js';
import { dayStart, localDate, todayLocal, yearOf } from '../../platform/time.js';
import { FxService } from '../finance/fx.service.js';
import { ACCOUNTS, cashAccount, LedgerService } from '../finance/ledger.service.js';
import { DunningService } from './dunning.service.js';
import { minMax } from './helpers.js';
import { InvoicingService } from './invoicing.service.js';

const { min } = minMax;
const abs = (x: bigint) => (x < 0n ? -x : x);
const ALLOCATABLE = ['OPEN', 'UNCOLLECTIBLE'];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly seq: SequenceService,
    private readonly fx: FxService, private readonly ledger: LedgerService, private readonly invoicing: InvoicingService, private readonly dunning: DunningService,
  ) {}

  // ── Qo'lda to'lov ──
  async record(input: PaymentRecordInput, auth: AuthContext) {
    const client = await this.db.client.findFirst({ where: { id: input.clientId, deletedAt: null } });
    if (!client) throw notFound('Mijoz');
    if (input.receivedOn > todayLocal()) throw badRequest("To'lov sanasi kelajakda bo'lishi mumkin emas");
    const amount = parseMoney(input.amount);
    let rateScaled = RATE_SCALE;
    let fxRateId: string | null = null;
    if (input.currency === 'USD') {
      if (input.fxRate) rateScaled = parseRate(input.fxRate);
      else { const r = await this.fx.requireRate(input.receivedOn); rateScaled = r.scaled; fxRateId = r.id; }
    }
    if (input.receiptFileId && !(await this.db.file.findFirst({ where: { id: input.receiptFileId, deletedAt: null } }))) throw notFound('Kvitansiya fayli');
    const canApprove = auth.permissions.has('payments:approve');
    const p = await this.db.$transaction(async (tx) => {
      const code = await this.seq.code(tx, 'PAY', { year: yearOf(input.receivedOn) });
      const pay = await tx.payment.create({
        data: {
          code, clientId: input.clientId, method: input.method, status: canApprove ? 'POSTED' : 'PENDING_APPROVAL', currency: input.currency,
          amountMinor: amount, fxRateId, fxRate: rateToString(rateScaled), amountUzsMinor: input.currency === 'UZS' ? amount : convertMinor(amount, rateScaled),
          receivedAt: dayStart(input.receivedOn), externalRef: input.externalRef, receiptFileId: input.receiptFileId ?? null, notes: input.notes,
          createdById: auth.userId, approvedById: canApprove ? auth.userId : null,
        },
      });
      if (canApprove) await this.postJournal(tx, pay);
      await this.audit.record(tx, { action: canApprove ? 'payment.posted' : 'payment.recorded', resourceType: 'payment', resourceId: pay.id, metadata: { code, amount: input.amount, currency: input.currency, method: input.method } });
      await this.outbox.add(tx, {
        type: canApprove ? 'payment.posted' : 'payment.pending_approval', eventKey: `payment.${canApprove ? 'posted' : 'pending'}:${pay.id}`,
        aggregateType: 'payment', aggregateId: pay.id, payload: { code, clientId: input.clientId, amountMinor: amount.toString(), currency: input.currency },
      });
      return pay;
    });
    if (p.status === 'POSTED') await this.autoAllocate(p.clientId);
    return { id: p.id, code: p.code, status: p.status };
  }

  private async postJournal(tx: DbTx, p: Payment) {
    await this.ledger.post(tx, {
      key: `payment:${p.id}:post`, date: localDate(p.receivedAt), sourceType: 'payment', sourceId: p.id, description: p.code,
      lines: [
        { account: cashAccount(p.method), currency: p.currency, amountMinor: p.amountMinor, amountUzsMinor: p.amountUzsMinor, clientId: p.clientId },
        { account: ACCOUNTS.ADVANCES, currency: p.currency, amountMinor: -p.amountMinor, amountUzsMinor: -p.amountUzsMinor, clientId: p.clientId },
      ],
    });
  }

  private async lockPayment(tx: DbTx, id: string) {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
    const p = await tx.payment.findUnique({ where: { id } });
    if (!p) throw notFound("To'lov");
    return p;
  }

  /** Rahbar (yoki rahbar ruxsat bergan xodim) tasdiqlaydi — DB trigger ham ruxsatni tekshiradi. */
  async approve(id: string, auth: AuthContext) {
    const p = await this.db.$transaction(async (tx) => {
      const pay = await this.lockPayment(tx, id);
      if (pay.status !== 'PENDING_APPROVAL') throw conflict("To'lov allaqachon ko'rib chiqilgan");
      const upd = await tx.payment.update({ where: { id }, data: { status: 'POSTED', approvedById: auth.userId } });
      await this.postJournal(tx, upd);
      await this.audit.record(tx, { action: 'payment.approved', resourceType: 'payment', resourceId: id, metadata: { code: pay.code } });
      await this.outbox.add(tx, { type: 'payment.posted', eventKey: `payment.posted:${id}`, aggregateType: 'payment', aggregateId: id, payload: { code: pay.code, clientId: pay.clientId } });
      return upd;
    });
    await this.autoAllocate(p.clientId);
    return { ok: true };
  }

  async reject(id: string, reason: string) {
    await this.db.$transaction(async (tx) => {
      const pay = await this.lockPayment(tx, id);
      if (pay.status !== 'PENDING_APPROVAL') throw conflict("To'lov allaqachon ko'rib chiqilgan");
      await tx.payment.update({ where: { id }, data: { status: 'REJECTED', notes: [pay.notes, `Rad etildi: ${reason}`].filter(Boolean).join('\n') } });
      await this.audit.record(tx, { action: 'payment.rejected', resourceType: 'payment', resourceId: id, reason, metadata: { code: pay.code } });
    });
    return { ok: true };
  }

  // ── Taqsimlash ──
  /** USD to'lov qismining UZS carrying qiymati (oxirgi qism qoldiqni oladi). */
  private async paymentShare(tx: DbOrTx, p: Payment, amt: bigint, avail: bigint) {
    if (p.currency === 'UZS') return amt;
    if (amt === avail && p.refundedMinor === 0n) {
      const s = await tx.allocation.aggregate({ where: { paymentId: p.id }, _sum: { settledUzsMinor: true } });
      return p.amountUzsMinor - (s._sum.settledUzsMinor ?? 0n);
    }
    return mulDivRound(amt, p.amountUzsMinor, p.amountMinor);
  }

  /**
   * Bitta to'lovdan bitta invoice'ga taqsimlash. `want` — invoice valyutasida (null — iloji boricha).
   * Valyutalararo: UZS→USD — to'lov sanasidagi CBU kursi; USD→UZS — to'lovning o'z kursi. DB CHECK ±1 so'm tolerantlikni tekshiradi.
   */
  private async allocateOne(tx: DbTx, p: Payment, inv: Invoice, want: bigint | null, actorId: string | null) {
    const availP = p.amountMinor - p.allocatedMinor - p.refundedMinor;
    const outI = inv.totalMinor - inv.paidMinor - inv.creditedMinor;
    if (availP <= 0n || outI <= 0n || !ALLOCATABLE.includes(inv.status) || p.status !== 'POSTED') return null;
    const cap = (x: bigint) => (want !== null && want < x ? want : x);
    let amtP: bigint; let amtI: bigint; let rateStr = rateToString(RATE_SCALE); let rateId: string | null = null;
    let settled: bigint; let carrying: bigint;
    if (p.currency === inv.currency) {
      amtI = cap(min(outI, availP)); amtP = amtI;
      carrying = await this.invoicing.carryingShare(tx, inv, amtI);
      settled = await this.paymentShare(tx, p, amtP, availP);
    } else if (p.currency === 'UZS') {
      const r = await this.fx.rateOn(localDate(p.receivedAt), tx);
      if (!r) return null;
      rateStr = r.str; rateId = r.id;
      amtI = cap(min(outI, (availP * RATE_SCALE) / r.scaled)); // floor: UZS yetadigan sentlar
      amtP = convertMinor(amtI, r.scaled);
      if (amtI < outI && want === null) {
        // ±1 so'm ichida yetishmasa ham invoice'ni yopamiz (DB tolerantligi)
        const full = convertMinor(outI, r.scaled);
        if (full - availP <= 100n && full - availP > 0n) { amtI = outI; amtP = availP; }
      }
      if (amtI <= 0n || amtP <= 0n) return null;
      settled = amtP;
      carrying = await this.invoicing.carryingShare(tx, inv, amtI);
    } else {
      const r = parseRate(p.fxRate.toString());
      rateStr = rateToString(r); rateId = p.fxRateId;
      amtI = cap(min(outI, convertMinor(availP, r)));
      amtP = min(mulDivRound(amtI, RATE_SCALE, r), availP);
      if (abs(amtI - convertMinor(amtP, r)) > 100n) amtI = min(outI, convertMinor(amtP, r));
      if (amtI <= 0n || amtP <= 0n) return null;
      carrying = amtI;
      settled = await this.paymentShare(tx, p, amtP, availP);
    }
    const fxDiff = settled - carrying;
    const a = await tx.allocation.create({
      data: {
        clientId: p.clientId, paymentId: p.id, paymentCurrency: p.currency, invoiceId: inv.id, invoiceCurrency: inv.currency,
        amountPaymentMinor: amtP, amountInvoiceMinor: amtI, fxRateId: rateId, fxRate: rateStr, settledUzsMinor: settled, carryingUzsMinor: carrying,
        fxDiffUzsMinor: fxDiff, appliedAt: new Date(), createdById: actorId,
      },
    });
    await this.ledger.post(tx, {
      key: `allocation:${a.id}`, date: todayLocal(), sourceType: 'allocation', sourceId: a.id, description: `${p.code} → ${inv.number}`,
      lines: [
        { account: ACCOUNTS.ADVANCES, currency: p.currency, amountMinor: amtP, amountUzsMinor: settled, clientId: p.clientId },
        { account: ACCOUNTS.AR, currency: inv.currency, amountMinor: -amtI, amountUzsMinor: -carrying, clientId: p.clientId },
        { account: fxDiff > 0n ? ACCOUNTS.FX_GAIN : ACCOUNTS.FX_LOSS, currency: 'UZS', amountMinor: -fxDiff, amountUzsMinor: -fxDiff, clientId: p.clientId },
      ],
    });
    p.allocatedMinor += amtP;
    inv.paidMinor += amtI;
    if (inv.paidMinor + inv.creditedMinor === inv.totalMinor) inv.status = 'PAID';
    return a;
  }

  private async lockClientRows(tx: DbTx, clientId: string, paymentIds?: string[], invoiceIds?: string[]) {
    // Lock tartibi: avval to'lovlar, keyin invoice'lar (id bo'yicha) — trigger bilan bir xil, deadlock'siz
    if (paymentIds) await tx.$queryRaw`SELECT id FROM payments WHERE id = ANY(${paymentIds}::uuid[]) ORDER BY id FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM payments WHERE client_id = ${clientId}::uuid AND status = 'POSTED' AND allocated_minor + refunded_minor < amount_minor ORDER BY id FOR UPDATE`;
    if (invoiceIds) await tx.$queryRaw`SELECT id FROM invoices WHERE id = ANY(${invoiceIds}::uuid[]) ORDER BY id FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM invoices WHERE client_id = ${clientId}::uuid AND status IN ('OPEN','UNCOLLECTIBLE') ORDER BY id FOR UPDATE`;
  }

  /** To'lovni avval aynan ko'rsatilgan invoice'larga (masalan, mijoz kabinetda tanlab to'laganlariga), qoldig'ini — FIFO. */
  async allocateToInvoices(paymentId: string, invoiceIds: string[]) {
    const p0 = await this.db.payment.findUnique({ where: { id: paymentId } });
    if (!p0 || p0.status !== 'POSTED') return { allocations: 0 };
    const affected = await this.db.$transaction(async (tx) => {
      await this.lockClientRows(tx, p0.clientId, [paymentId], invoiceIds);
      const invoices = await tx.invoice.findMany({ where: { id: { in: invoiceIds }, clientId: p0.clientId }, orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { createdAt: 'asc' }] });
      const subs = new Set<string>();
      for (const inv of invoices) {
        const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
        if (p.currency !== inv.currency && p.currency !== 'UZS') continue;
        if (await this.allocateOne(tx, p, inv, null, null)) { if (inv.subscriptionId) subs.add(inv.subscriptionId); }
      }
      return [...subs];
    }, { timeout: 30_000 });
    for (const s of affected) await this.dunning.reconcile(s);
    await this.autoAllocate(p0.clientId);
    return { allocations: affected.length };
  }

  /** Mijozning taqsimlanmagan to'lovlarini (kredit) eng eski invoice'lardan boshlab avtomatik qo'llaydi. */
  async autoAllocate(clientId: string) {
    const affected = await this.db.$transaction(async (tx) => {
      await this.lockClientRows(tx, clientId);
      const payments = await tx.payment.findMany({ where: { clientId, status: 'POSTED' }, orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }] });
      const open = payments.filter((p) => p.amountMinor - p.allocatedMinor - p.refundedMinor > 0n);
      if (!open.length) return [];
      const invoices = await tx.invoice.findMany({ where: { clientId, status: { in: ['OPEN', 'UNCOLLECTIBLE'] } }, orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { createdAt: 'asc' }] });
      const subs = new Set<string>();
      let n = 0;
      for (const sameCurrency of [true, false]) {
        for (const inv of invoices) {
          for (const p of open) {
            if ((p.currency === inv.currency) !== sameCurrency) continue;
            if (!sameCurrency && p.currency !== 'UZS') continue; // USD pul → UZS invoice faqat qo'lda
            const a = await this.allocateOne(tx, p, inv, null, null);
            if (a) { n++; if (inv.subscriptionId) subs.add(inv.subscriptionId); }
          }
        }
      }
      if (n) await this.audit.record(tx, { action: 'payment.auto_allocated', resourceType: 'client', resourceId: clientId, metadata: { allocations: n } });
      return [...subs];
    }, { timeout: 30_000 });
    for (const s of affected) await this.dunning.reconcile(s);
    return { allocations: affected.length };
  }

  async allocate(paymentId: string, input: AllocateInput, auth: AuthContext) {
    const subs = await this.db.$transaction(async (tx) => {
      const pay0 = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!pay0) throw notFound("To'lov");
      await this.lockClientRows(tx, pay0.clientId, [paymentId], input.items.map((i) => i.invoiceId));
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (p.status !== 'POSTED') throw conflict("To'lov tasdiqlanmagan");
      const out = new Set<string>();
      for (const it of input.items) {
        const inv = await tx.invoice.findUnique({ where: { id: it.invoiceId } });
        if (!inv || inv.clientId !== p.clientId) throw notFound('Invoice');
        const want = parseMoney(it.amount);
        const a = await this.allocateOne(tx, p, inv, want, auth.userId);
        if (!a) throw conflict(`${inv.number ?? 'Invoice'}: taqsimlab bo'lmadi (qoldiq yoki to'lov mablag'i yetarli emas, yoki kurs yo'q)`);
        if (inv.subscriptionId) out.add(inv.subscriptionId);
      }
      await this.audit.record(tx, { action: 'payment.allocated', resourceType: 'payment', resourceId: paymentId, metadata: { items: input.items } });
      return [...out];
    }, { timeout: 30_000 });
    for (const s of subs) await this.dunning.reconcile(s);
    return { ok: true };
  }

  /** Taqsimotni bekor qilish: aynan teskari (manfiy) allocation + teskari ledger yozuvi. */
  async reverseAllocation(allocationId: string, auth: AuthContext) {
    return this.db.$transaction(async (tx) => {
      const a = await tx.allocation.findUnique({ where: { id: allocationId }, include: { reversedBy: true } });
      if (!a) throw notFound('Taqsimot');
      if (a.reversalOfId) throw badRequest("Bekor qilish yozuvini bekor qilib bo'lmaydi");
      if (a.reversedBy) throw conflict('Taqsimot allaqachon bekor qilingan');
      await this.lockClientRows(tx, a.clientId, [a.paymentId], [a.invoiceId]);
      const r = await tx.allocation.create({
        data: {
          clientId: a.clientId, paymentId: a.paymentId, paymentCurrency: a.paymentCurrency, invoiceId: a.invoiceId, invoiceCurrency: a.invoiceCurrency,
          amountPaymentMinor: -a.amountPaymentMinor, amountInvoiceMinor: -a.amountInvoiceMinor, fxRateId: a.fxRateId, fxRate: a.fxRate,
          settledUzsMinor: -a.settledUzsMinor, carryingUzsMinor: -a.carryingUzsMinor, fxDiffUzsMinor: -a.fxDiffUzsMinor,
          appliedAt: new Date(), reversalOfId: a.id, createdById: auth.userId,
        },
      });
      const entry = await tx.journalEntry.findUnique({ where: { idempotencyKey: `allocation:${a.id}` }, include: { lines: true } });
      if (entry) {
        await this.ledger.post(tx, {
          key: `allocation:${r.id}`, date: todayLocal(), sourceType: 'allocation', sourceId: r.id, description: `Bekor: ${entry.description ?? ''}`,
          lines: entry.lines.map((l) => ({ account: l.accountCode, currency: l.currency, amountMinor: -l.amountMinor, amountUzsMinor: -l.amountUzsMinor, clientId: l.clientId, projectId: l.projectId })),
        });
      }
      await this.audit.record(tx, { action: 'allocation.reversed', resourceType: 'payment', resourceId: a.paymentId, metadata: { allocationId: a.id, invoiceId: a.invoiceId } });
      return { id: r.id };
    });
  }

  // ── Refund ──
  async requestRefund(paymentId: string, amountStr: string, reason: string, auth: AuthContext) {
    const amount = parseMoney(amountStr);
    return this.db.$transaction(async (tx) => {
      const p = await this.lockPayment(tx, paymentId);
      if (p.status !== 'POSTED') throw conflict("Faqat tasdiqlangan to'lov qaytariladi");
      if (p.gatewayTransactionId) throw badRequest("Onlayn to'lov refundi provayder orqali (integratsiya bosqichida)");
      if (amount > p.amountMinor - p.allocatedMinor - p.refundedMinor) throw conflict("Refund summasi taqsimlanmagan qoldiqdan katta — avval taqsimotni bekor qiling");
      let f = await tx.refund.create({ data: { paymentId, amountMinor: amount, reason, requestedById: auth.userId } });
      if (auth.permissions.has('refunds:approve')) f = await tx.refund.update({ where: { id: f.id }, data: { status: 'APPROVED', approvedById: auth.userId } });
      await this.audit.record(tx, { action: 'refund.requested', resourceType: 'payment', resourceId: paymentId, reason, metadata: { refundId: f.id, amount: amount.toString(), status: f.status } });
      await this.outbox.add(tx, { type: 'refund.requested', eventKey: `refund.requested:${f.id}`, aggregateType: 'payment', aggregateId: paymentId, payload: { refundId: f.id } });
      return { id: f.id, status: f.status };
    });
  }

  private async lockRefund(tx: DbTx, id: string) {
    await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${id}::uuid FOR UPDATE`;
    const f = await tx.refund.findUnique({ where: { id }, include: { payment: true } });
    if (!f) throw notFound('Refund');
    return f;
  }

  async decideRefund(id: string, approve: boolean, reason: string | undefined, auth: AuthContext) {
    return this.db.$transaction(async (tx) => {
      const f = await this.lockRefund(tx, id);
      if (f.status !== 'REQUESTED') throw conflict("Refund allaqachon ko'rib chiqilgan");
      await tx.refund.update({ where: { id }, data: approve ? { status: 'APPROVED', approvedById: auth.userId } : { status: 'FAILED' } });
      await this.audit.record(tx, { action: approve ? 'refund.approved' : 'refund.rejected', resourceType: 'payment', resourceId: f.paymentId, reason, metadata: { refundId: id } });
      return { ok: true };
    });
  }

  /** Pul mijozga haqiqatda qaytarilgach — SUCCEEDED + ledger (Avans ↔ Kassa/Bank). */
  async completeRefund(id: string, succeeded: boolean, auth: AuthContext) {
    return this.db.$transaction(async (tx) => {
      const f = await this.lockRefund(tx, id);
      if (f.status !== 'APPROVED') throw conflict('Refund tasdiqlanmagan yoki yakunlangan');
      if (!succeeded) {
        await tx.refund.update({ where: { id }, data: { status: 'FAILED' } });
        await this.audit.record(tx, { action: 'refund.failed', resourceType: 'payment', resourceId: f.paymentId, metadata: { refundId: id } });
        return { ok: true };
      }
      await tx.refund.update({ where: { id }, data: { status: 'SUCCEEDED', completedAt: new Date() } });
      const p = f.payment;
      const uzs = p.currency === 'UZS' ? f.amountMinor : mulDivRound(f.amountMinor, p.amountUzsMinor, p.amountMinor);
      await this.ledger.post(tx, {
        key: `refund:${id}`, date: todayLocal(), sourceType: 'refund', sourceId: id, description: `Refund ${p.code}`,
        lines: [
          { account: ACCOUNTS.ADVANCES, currency: p.currency, amountMinor: f.amountMinor, amountUzsMinor: uzs, clientId: p.clientId },
          { account: cashAccount(p.method), currency: p.currency, amountMinor: -f.amountMinor, amountUzsMinor: -uzs, clientId: p.clientId },
        ],
      });
      await this.audit.record(tx, { action: 'refund.completed', resourceType: 'payment', resourceId: f.paymentId, metadata: { refundId: id, by: auth.userId } });
      await this.outbox.add(tx, { type: 'refund.completed', eventKey: `refund.completed:${id}`, aggregateType: 'payment', aggregateId: f.paymentId, payload: { refundId: id, clientId: p.clientId } });
      return { ok: true };
    });
  }
}
