import { Injectable } from '@nestjs/common';
import { parseMoney, type SubscriptionChangeInput, type SubscriptionCreateInput, type SubscriptionItemInput } from '@ads/contracts';
import { Prisma, type RevisionChange } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { badRequest, conflict, notFound, staleVersion } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { SequenceService } from '../../platform/sequence.service.js';
import { addDays, dayStart, dbDate, fromDbDate, nowInstant, todayLocal } from '../../platform/time.js';
import { BILLABLE, type ItemSpec, revisionMrr } from './helpers.js';
import { InvoicingService } from './invoicing.service.js';
import { LifecycleService, type PendingChange, specsOf } from './lifecycle.service.js';
import { PaymentsService } from './payments.service.js';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly seq: SequenceService,
    private readonly lifecycle: LifecycleService, private readonly invoicing: InvoicingService, private readonly payments: PaymentsService,
  ) {}

  /** Tarif narxlarini tekshiradi va snapshot qiladi (kelishilgan narx bo'lsa — o'sha). */
  private async resolveItems(projectId: string, currency: string, items: SubscriptionItemInput[], at: string): Promise<ItemSpec[]> {
    if (new Set(items.map((i) => i.planPriceId)).size !== items.length) throw badRequest('Bir xil narx ikki marta tanlangan');
    const prices = await this.db.planPrice.findMany({ where: { id: { in: items.map((i) => i.planPriceId) } }, include: { plan: true } });
    const byId = new Map(prices.map((p) => [p.id, p]));
    const specs = items.map((i): ItemSpec => {
      const p = byId.get(i.planPriceId);
      if (!p) throw notFound('Tarif narxi');
      if (p.plan.projectId !== projectId) throw badRequest(`"${p.plan.name}" boshqa loyihaning tarifi`);
      if (p.currency !== currency) throw badRequest(`"${p.plan.name}" narxi ${p.currency}da — obuna valyutasi ${currency}`);
      if (!p.plan.isActive) throw badRequest(`"${p.plan.name}" tarifi faol emas`);
      const from = fromDbDate(p.validFrom)!; const to = fromDbDate(p.validTo);
      if (from > at || (to && to <= at)) throw badRequest(`"${p.plan.name}" narxi ${at} sanada amal qilmaydi`);
      return {
        planPriceId: p.id, quantity: i.quantity, unitAmountMinor: i.unitAmount ? parseMoney(i.unitAmount) : p.unitAmountMinor, discountBp: i.discountBp,
        vatRateBp: p.vatRateBp, planName: p.plan.name, planCode: p.plan.code, intervalMonths: p.plan.intervalMonths, ikpuCode: p.ikpuCode, packageCode: p.packageCode,
      };
    });
    if (new Set(specs.map((s) => s.intervalMonths)).size > 1) throw badRequest("Bitta obunada to'lov davri (oylar soni) har xil tariflar bo'lmaydi");
    return specs;
  }

  /** `autoAllocate: false` — checkout: to'lov avval aynan shu obuna invoice'iga yo'naltiriladi (FIFO emas). */
  async create(input: SubscriptionCreateInput, opts: { autoAllocate?: boolean } = {}) {
    const cp = await this.db.clientProject.findUnique({ where: { id: input.clientProjectId }, include: { client: true } });
    if (!cp || cp.client.deletedAt) throw notFound("Mijoz–loyiha bog'lanishi");
    if (cp.status === 'CHURNED') throw conflict("Bog'lanish holati 'Ketgan' — avval holatini o'zgartiring");
    const items = await this.resolveItems(cp.projectId, input.currency, input.items, input.startDate);
    const trial = input.trialDays > 0;
    const trialEnd = trial ? addDays(input.startDate, input.trialDays) : null;
    const sub = await this.db.$transaction(async (tx) => {
      const code = await this.seq.code(tx, 'SUB');
      const s = await tx.subscription.create({
        data: {
          code, clientId: cp.clientId, clientProjectId: cp.id, currency: input.currency, status: trial ? 'TRIALING' : 'ACTIVE',
          trialEndsOn: trialEnd ? dbDate(trialEnd) : null, nextBillingOn: dbDate(trialEnd ?? input.startDate),
          paymentTermsDays: input.paymentTermsDays, graceDays: input.graceDays,
        },
        include: { clientProject: { select: { projectId: true } } },
      });
      await this.lifecycle.newRevision(tx, s, { at: dayStart(input.startDate), status: s.status, changeType: 'CREATED', items });
      if (cp.status === 'PROSPECT' || cp.status === 'ONBOARDING') {
        await tx.clientProject.update({ where: { id: cp.id }, data: { status: 'ACTIVE', startedOn: cp.startedOn ?? dbDate(input.startDate), rowVersion: { increment: 1 } } });
      }
      if (cp.client.status === 'LEAD') await tx.client.update({ where: { id: cp.clientId }, data: { status: 'ACTIVE', rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'subscription.created', resourceType: 'subscription', resourceId: s.id, metadata: { code, clientId: cp.clientId, currency: input.currency, startDate: input.startDate, trialDays: input.trialDays } });
      await this.outbox.add(tx, { type: 'subscription.created', eventKey: `subscription.created:${s.id}`, aggregateType: 'subscription', aggregateId: s.id, payload: { code, clientId: cp.clientId } });
      return s;
    });
    if (input.startDate <= todayLocal()) await this.billNow(sub.id, opts.autoAllocate ?? true);
    return { id: sub.id, code: sub.code };
  }

  async billNow(id: string, autoAllocate = true) {
    const sub = await this.db.subscription.findUnique({ where: { id } });
    if (!sub) throw notFound('Obuna');
    const r = await this.invoicing.billSubscription(id);
    if (r.invoices.length && autoAllocate) await this.payments.autoAllocate(sub.clientId);
    return r;
  }

  async change(id: string, input: SubscriptionChangeInput, auth: AuthContext) {
    const sub0 = await this.db.subscription.findUnique({ where: { id }, include: { clientProject: true } });
    if (!sub0) throw notFound('Obuna');
    if (!(BILLABLE as readonly string[]).includes(sub0.status)) throw conflict("Faqat faol (yoki sinovdagi) obunani o'zgartirish mumkin");
    const today = todayLocal();
    const boundary = sub0.status === 'TRIALING' ? fromDbDate(sub0.trialEndsOn)! : (fromDbDate(sub0.nextBillingOn) ?? today);
    const items = await this.resolveItems(sub0.clientProject.projectId, sub0.currency, input.items, input.effective === 'now' ? today : boundary);
    const r = await this.db.$transaction(async (tx) => {
      const sub = await this.lifecycle.lock(tx, id);
      if (sub.rowVersion !== input.rowVersion) throw staleVersion();
      if (sub.pendingChange) throw conflict("Rejalashtirilgan o'zgarish bor — avval uni bekor qiling");
      const open = await this.lifecycle.openRevision(tx, id);
      if (!open) throw conflict('Obuna revisioni topilmadi');
      const old = specsOf(open);
      const oldKeys = old.map((i) => i.planPriceId).sort().join();
      const newKeys = items.map((i) => i.planPriceId).sort().join();
      const changeType: RevisionChange = oldKeys !== newKeys ? 'PLAN_CHANGE'
        : old.some((o) => items.find((n) => n.planPriceId === o.planPriceId)!.quantity !== o.quantity) ? 'QUANTITY_CHANGE' : 'PRICE_CHANGE';
      const newMrr = revisionMrr(items);
      if (input.effective === 'now') {
        if (newMrr < open.mrrMinor) throw badRequest('Tarifni kamaytirish faqat keyingi davrdan kuchga kiradi');
        if (items[0]!.intervalMonths !== old[0]?.intervalMonths) throw badRequest("To'lov davri o'zgarishi faqat keyingi davrdan");
        const rev = await this.lifecycle.newRevision(tx, sub, { at: nowInstant(), status: sub.status, changeType, reason: input.reason, items });
        await tx.subscription.update({ where: { id }, data: { rowVersion: { increment: 1 } } });
        const invoiceId = sub.status === 'TRIALING' ? null : await this.invoicing.prorationForUpgrade(tx, sub, old, items, rev.id, today);
        await this.audit.record(tx, { action: 'subscription.changed', resourceType: 'subscription', resourceId: id, reason: input.reason ?? undefined, metadata: { changeType, oldMrr: open.mrrMinor.toString(), newMrr: newMrr.toString(), invoiceId } });
        return { applied: 'now' as const, invoiceId };
      }
      const pc: PendingChange = {
        effectiveOn: boundary, changeType, reason: input.reason, requestedById: auth.userId,
        items: items.map((i) => ({ planPriceId: i.planPriceId, quantity: i.quantity, unitAmountMinor: i.unitAmountMinor.toString(), discountBp: i.discountBp })),
      };
      await tx.subscription.update({ where: { id }, data: { pendingChange: pc as unknown as Prisma.InputJsonValue, rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'subscription.change_scheduled', resourceType: 'subscription', resourceId: id, reason: input.reason ?? undefined, metadata: { changeType, effectiveOn: boundary, newMrr: newMrr.toString() } });
      return { applied: 'next_period' as const, effectiveOn: boundary };
    });
    if ('invoiceId' in r && r.invoiceId) await this.payments.autoAllocate(sub0.clientId);
    return r;
  }

  async cancelPendingChange(id: string) {
    const sub = await this.db.subscription.findUnique({ where: { id } });
    if (!sub) throw notFound('Obuna');
    if (!sub.pendingChange) throw conflict("Rejalashtirilgan o'zgarish yo'q");
    await this.db.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id }, data: { pendingChange: Prisma.DbNull, rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'subscription.change_cancelled', resourceType: 'subscription', resourceId: id });
    });
    return { ok: true };
  }

  async cancel(id: string, atPeriodEnd: boolean, reason: string, rowVersion: number) {
    return this.db.$transaction(async (tx) => {
      const sub = await this.lifecycle.lock(tx, id);
      if (sub.rowVersion !== rowVersion) throw staleVersion();
      if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') throw conflict('Obuna allaqachon tugagan');
      if (atPeriodEnd && sub.status !== 'SUSPENDED') {
        await tx.subscription.update({ where: { id }, data: { cancelAtPeriodEnd: true, rowVersion: { increment: 1 } } });
        await this.audit.record(tx, { action: 'subscription.cancel_scheduled', resourceType: 'subscription', resourceId: id, reason, metadata: { at: fromDbDate(sub.nextBillingOn) } });
        return { ok: true, at: fromDbDate(sub.nextBillingOn) };
      }
      await this.lifecycle.transition(tx, sub, 'CANCELLED', { reason });
      return { ok: true, at: todayLocal() };
    });
  }

  async resume(id: string, rowVersion: number) {
    return this.db.$transaction(async (tx) => {
      const sub = await this.lifecycle.lock(tx, id);
      if (sub.rowVersion !== rowVersion) throw staleVersion();
      if (!sub.cancelAtPeriodEnd) throw conflict('Bekor qilish rejalashtirilmagan');
      await tx.subscription.update({ where: { id }, data: { cancelAtPeriodEnd: false, rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'subscription.cancel_withdrawn', resourceType: 'subscription', resourceId: id });
      return { ok: true };
    });
  }

  /** PAST_DUE → SUSPENDED (imtiyozli muddatni kutmasdan). */
  async suspend(id: string, reason: string, rowVersion: number) {
    return this.db.$transaction(async (tx) => {
      const sub = await this.lifecycle.lock(tx, id);
      if (sub.rowVersion !== rowVersion) throw staleVersion();
      if (sub.status !== 'PAST_DUE') throw conflict("Faqat to'lovi kechikkan obunani to'xtatish mumkin");
      await this.lifecycle.transition(tx, sub, 'SUSPENDED', { reason });
      return { ok: true };
    });
  }

  async updateTerms(id: string, paymentTermsDays: number, graceDays: number, rowVersion: number) {
    const before = await this.db.subscription.findUnique({ where: { id } });
    if (!before) throw notFound('Obuna');
    const r = await this.db.subscription.updateMany({ where: { id, rowVersion }, data: { paymentTermsDays, graceDays, rowVersion: { increment: 1 } } });
    if (!r.count) throw staleVersion();
    await this.audit.record(this.db, { action: 'subscription.terms_updated', resourceType: 'subscription', resourceId: id, changes: { before: { paymentTermsDays: before.paymentTermsDays, graceDays: before.graceDays }, after: { paymentTermsDays, graceDays } } });
    return { ok: true };
  }
}
