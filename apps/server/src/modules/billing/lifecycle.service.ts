import { Injectable } from '@nestjs/common';
import { Prisma, type RevisionChange, type Subscription, type SubscriptionStatus } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import type { DbTx } from '../../platform/db.service.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { dayStart, dbDate, nowInstant } from '../../platform/time.js';
import { currentActor, effectiveMrr, type ItemSpec, movementType, revisionMrr } from './helpers.js';

export type SubWithCp = Subscription & { clientProject: { projectId: string } };
export interface PendingChange {
  effectiveOn: string; changeType: RevisionChange; reason: string | null; requestedById: string | null;
  items: { planPriceId: string; quantity: number; unitAmountMinor: string; discountBp: number }[];
}
const revInclude = { items: { include: { planPrice: { include: { plan: true } } } } } satisfies Prisma.SubscriptionRevisionInclude;
type RevWithItems = Prisma.SubscriptionRevisionGetPayload<{ include: typeof revInclude }>;

export const specsOf = (rev: RevWithItems): ItemSpec[] => rev.items.map((i) => ({
  planPriceId: i.planPriceId, quantity: i.quantity, unitAmountMinor: i.unitAmountMinor, discountBp: i.discountBp, vatRateBp: i.planPrice.vatRateBp,
  planName: i.planPrice.plan.name, planCode: i.planPrice.plan.code, intervalMonths: i.planPrice.plan.intervalMonths,
  ikpuCode: i.planPrice.ikpuCode, packageCode: i.planPrice.packageCode,
}));

/** Obuna hayot sikli: revision'lar (append-only), holat o'tishlari, MRR harakatlari. */
@Injectable()
export class LifecycleService {
  constructor(private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  /** Obuna qatorini qulflaydi (billing, dunning, o'zgarishlar ketma-ket bo'lishi uchun). */
  async lock(tx: DbTx, id: string): Promise<SubWithCp> {
    await tx.$queryRaw`SELECT id FROM subscriptions WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.subscription.findUniqueOrThrow({ where: { id }, include: { clientProject: { select: { projectId: true } } } });
  }

  openRevision(tx: DbTx, subscriptionId: string) {
    return tx.subscriptionRevision.findFirst({ where: { subscriptionId, validTo: null }, include: revInclude });
  }

  revisionAt(tx: DbTx, subscriptionId: string, at: Date) {
    return tx.subscriptionRevision.findFirst({
      where: { subscriptionId, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] }, include: revInclude,
    });
  }

  /** Ochiq revisionni `at` da yopib, yangisini ochadi; MRR harakatini yozadi. */
  async newRevision(tx: DbTx, sub: SubWithCp, p: {
    at: Date; status: SubscriptionStatus; changeType: RevisionChange; reason?: string | null; reactivation?: boolean;
    items?: { planPriceId: string; quantity: number; unitAmountMinor: bigint; discountBp: number; intervalMonths: number }[];
  }) {
    const open = await this.openRevision(tx, sub.id);
    let at = p.at;
    if (open && at.getTime() <= open.validFrom.getTime()) at = new Date(open.validFrom.getTime() + 1000);
    if (open) await tx.subscriptionRevision.update({ where: { id: open.id }, data: { validTo: at } });
    const items = p.items ?? (open ? specsOf(open) : []);
    const mrr = revisionMrr(items);
    const last = await tx.subscriptionRevision.aggregate({ where: { subscriptionId: sub.id }, _max: { revisionNo: true } });
    const actor = currentActor();
    const rev = await tx.subscriptionRevision.create({
      data: {
        subscriptionId: sub.id, revisionNo: (last._max.revisionNo ?? 0) + 1, currency: sub.currency, validFrom: at, status: p.status,
        mrrMinor: mrr, changeType: p.changeType, reason: p.reason ?? null, actorType: actor.actorType, actorId: actor.actorId,
      },
    });
    if (items.length) {
      await tx.subscriptionRevisionItem.createMany({
        data: items.map((i) => ({ revisionId: rev.id, currency: sub.currency, planPriceId: i.planPriceId, quantity: i.quantity, unitAmountMinor: i.unitAmountMinor, discountBp: i.discountBp })),
      });
    }
    const oldEff = open ? effectiveMrr(open.status, open.mrrMinor) : 0n;
    const newEff = effectiveMrr(p.status, mrr);
    const type = movementType(oldEff, newEff, !!p.reactivation);
    if (type) {
      await tx.mrrMovement.create({
        data: { revisionId: rev.id, clientId: sub.clientId, projectId: sub.clientProject.projectId, occurredAt: at, type, currency: sub.currency, deltaMinor: newEff - oldEff },
      });
    }
    return rev;
  }

  /** Holat o'tishi. Ruxsat etilgan o'tishlar jadvalini DB trigger'i ham tekshiradi. */
  async transition(tx: DbTx, sub: SubWithCp, to: SubscriptionStatus, p: { at?: Date; reason?: string | null; pastDueSince?: string; reactivation?: boolean; nextBillingOn?: string | null }) {
    const at = p.at ?? nowInstant();
    const data: Prisma.SubscriptionUncheckedUpdateInput = { status: to, rowVersion: { increment: 1 } };
    if (to === 'PAST_DUE' || to === 'SUSPENDED') data.pastDueSince = p.pastDueSince ? dbDate(p.pastDueSince) : (sub.pastDueSince ?? dbDate(at.toISOString().slice(0, 10)));
    else data.pastDueSince = null;
    if (to === 'CANCELLED' || to === 'EXPIRED') {
      data.endedAt = at; data.nextBillingOn = null; data.cancelAtPeriodEnd = false; data.pendingChange = Prisma.DbNull;
    }
    if (p.nextBillingOn !== undefined) data.nextBillingOn = p.nextBillingOn ? dbDate(p.nextBillingOn) : null;
    await tx.subscription.update({ where: { id: sub.id }, data });
    await this.newRevision(tx, sub, { at, status: to, changeType: 'STATUS_CHANGE', reason: p.reason, reactivation: p.reactivation });
    await this.audit.record(tx, { action: `subscription.${to.toLowerCase()}`, resourceType: 'subscription', resourceId: sub.id, reason: p.reason ?? undefined, metadata: { from: sub.status, to } });
    await this.outbox.add(tx, {
      type: `subscription.${to.toLowerCase()}`, eventKey: `subscription.${to}:${sub.id}:${at.getTime()}`, aggregateType: 'subscription', aggregateId: sub.id,
      payload: { clientId: sub.clientId, code: sub.code, from: sub.status, to },
    });
    return { ...sub, ...(data as object), status: to } as SubWithCp;
  }

  /** Rejalashtirilgan (keyingi davrdan) o'zgarishni davr chegarasida qo'llaydi. */
  async applyPendingChange(tx: DbTx, sub: SubWithCp, boundary: string) {
    const pc = sub.pendingChange as unknown as PendingChange | null;
    if (!pc || pc.effectiveOn > boundary) return false;
    const prices = await tx.planPrice.findMany({ where: { id: { in: pc.items.map((i) => i.planPriceId) } }, include: { plan: true } });
    const byId = new Map(prices.map((p) => [p.id, p]));
    await this.newRevision(tx, sub, {
      at: dayStart(pc.effectiveOn), status: sub.status, changeType: pc.changeType, reason: pc.reason,
      items: pc.items.map((i) => ({ ...i, unitAmountMinor: BigInt(i.unitAmountMinor), intervalMonths: byId.get(i.planPriceId)!.plan.intervalMonths })),
    });
    await tx.subscription.update({ where: { id: sub.id }, data: { pendingChange: Prisma.DbNull, rowVersion: { increment: 1 } } });
    await this.audit.record(tx, { action: 'subscription.change_applied', resourceType: 'subscription', resourceId: sub.id, metadata: { effectiveOn: pc.effectiveOn } });
    return true;
  }
}
