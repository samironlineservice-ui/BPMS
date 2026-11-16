import { Injectable } from '@nestjs/common';
import type { ApprovalInboxItem } from '@ads/contracts';
import type { ApprovalRequest } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { sha256Hex } from '../../platform/crypto.js';
import { Db, type DbOrTx, type DbTx } from '../../platform/db.service.js';
import { AppError, conflict, forbidden, notFound } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';

export interface ApprovalHandler {
  /** Inbox'da ko'rinadigan sarlavha va tavsif. */
  describe(payload: Record<string, unknown>): Promise<{ title: string; description: string; amountMinor?: string; currency?: string }>;
  /** Tasdiqlangandan keyin — o'sha tranzaksiyada bajariladi. */
  execute(tx: DbTx, request: ApprovalRequest, approverId: string): Promise<void>;
  onReject?(tx: DbTx, request: ApprovalRequest): Promise<void>;
}

/** Barqaror JSON (kalitlar tartiblangan) — payload hash uchun. */
export function canonicalJson(v: unknown): string {
  if (typeof v === 'bigint') return JSON.stringify(v.toString());
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

@Injectable()
export class ApprovalsService {
  private readonly handlers = new Map<string, ApprovalHandler>();
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  register(policyKey: string, handler: ApprovalHandler) {
    this.handlers.set(policyKey, handler);
  }

  private handler(key: string) {
    const h = this.handlers.get(key);
    if (!h) throw new Error(`approval handler for ${key} is not registered`);
    return h;
  }

  /**
   * Tasdiq so'rovi yaratadi. So'rovchida tasdiqlash ruxsati bo'lsa va siyosat ruxsat bersa
   * (rahbar) — darhol o'zi tasdiqlagan hisoblanadi va amal bajariladi (yozuvlar baribir qoladi).
   */
  async request(tx: DbTx, p: { policyKey: string; resourceType: string; resourceId: string; payload: Record<string, unknown>; auth: AuthContext }) {
    const policy = await tx.approvalPolicy.findUnique({ where: { key: p.policyKey } });
    if (!policy || !policy.enabled) throw new AppError(500, 'POLICY_MISSING', `Tasdiqlash siyosati topilmadi: ${p.policyKey}`);
    const pending = await tx.approvalRequest.findFirst({ where: { policyKey: p.policyKey, resourceId: p.resourceId, status: 'PENDING' } });
    if (pending) throw conflict("Bu amal uchun tasdiq so'rovi allaqachon kutilmoqda");
    const r = await tx.approvalRequest.create({
      data: {
        policyKey: p.policyKey, resourceType: p.resourceType, resourceId: p.resourceId, payload: p.payload as object,
        payloadHash: sha256Hex(canonicalJson(p.payload)), requestedById: p.auth.userId, requiredApprovals: policy.requiredApprovals,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    await this.audit.record(tx, { action: 'approval.requested', resourceType: p.resourceType, resourceId: p.resourceId, metadata: { requestId: r.id, policy: p.policyKey } });
    const selfApprove = policy.allowSelfApproval && p.auth.permissions.has(policy.approverPermission) && policy.requiredApprovals === 1;
    if (selfApprove) {
      await this.applyDecision(tx, r, p.auth.userId, true, 'Avtomatik: so\'rovchida tasdiqlash ruxsati bor');
      return { id: r.id, status: 'EXECUTED' as const };
    }
    await this.outbox.add(tx, { type: 'approval.requested', eventKey: `approval.requested:${r.id}`, aggregateType: 'approval_request', aggregateId: r.id, payload: { policyKey: p.policyKey } });
    return { id: r.id, status: 'PENDING' as const };
  }

  async decide(id: string, approve: boolean, comment: string | undefined, auth: AuthContext) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.approvalRequest.findUnique({ where: { id }, include: { policy: true } });
      if (!r) throw notFound("Tasdiq so'rovi");
      if (r.status !== 'PENDING') throw conflict("So'rov allaqachon ko'rib chiqilgan");
      if (r.expiresAt < new Date()) {
        await tx.approvalRequest.update({ where: { id }, data: { status: 'EXPIRED' } });
        throw conflict("So'rov muddati o'tgan");
      }
      if (!auth.permissions.has(r.policy.approverPermission)) throw forbidden("Bu so'rovni tasdiqlash uchun ruxsatingiz yo'q");
      await this.applyDecision(tx, r, auth.userId, approve, comment);
      return { ok: true };
    });
  }

  private async applyDecision(tx: DbTx, r: ApprovalRequest, approverId: string, approve: boolean, comment?: string) {
    if (sha256Hex(canonicalJson(r.payload)) !== r.payloadHash) throw new AppError(409, 'PAYLOAD_TAMPERED', "So'rov ma'lumotlari o'zgartirilgan — tasdiqlab bo'lmaydi");
    await tx.approvalDecision.create({ data: { requestId: r.id, approverId, approve, comment: comment ?? null } });
    const h = this.handler(r.policyKey);
    if (!approve) {
      await tx.approvalRequest.update({ where: { id: r.id }, data: { status: 'REJECTED' } });
      await h.onReject?.(tx, r);
      await this.audit.record(tx, { action: 'approval.rejected', resourceType: r.resourceType, resourceId: r.resourceId, reason: comment, metadata: { requestId: r.id, policy: r.policyKey } });
      return;
    }
    const approvals = await tx.approvalDecision.count({ where: { requestId: r.id, approve: true } });
    if (approvals < r.requiredApprovals) return;
    await tx.approvalRequest.update({ where: { id: r.id }, data: { status: 'APPROVED' } });
    await h.execute(tx, r, approverId);
    await tx.approvalRequest.update({ where: { id: r.id }, data: { status: 'EXECUTED', executedAt: new Date() } });
    await this.audit.record(tx, { action: 'approval.executed', resourceType: r.resourceType, resourceId: r.resourceId, metadata: { requestId: r.id, policy: r.policyKey } });
  }

  async cancel(id: string, auth: AuthContext) {
    const r = await this.db.approvalRequest.findUnique({ where: { id } });
    if (!r) throw notFound("Tasdiq so'rovi");
    if (r.requestedById !== auth.userId) throw forbidden("Faqat so'rov muallifi bekor qila oladi");
    if (r.status !== 'PENDING') throw conflict("So'rov allaqachon ko'rib chiqilgan");
    await this.db.$transaction(async (tx) => {
      await tx.approvalRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.handler(r.policyKey).onReject?.(tx, r);
      await this.audit.record(tx, { action: 'approval.cancelled', resourceType: r.resourceType, resourceId: r.resourceId, metadata: { requestId: id } });
    });
    return { ok: true };
  }

  async forResource(db: DbOrTx, resourceId: string) {
    const rows = await db.approvalRequest.findMany({ where: { resourceId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map((r) => ({ id: r.id, policyKey: r.policyKey, status: r.status, createdAt: r.createdAt.toISOString() }));
  }

  /** Tasdiqlar inbox'i: approval so'rovlari + tasdiqlanmagan to'lovlar + refund so'rovlari. */
  async inbox(auth: AuthContext): Promise<ApprovalInboxItem[]> {
    const [requests, payments, refunds] = await Promise.all([
      this.db.approvalRequest.findMany({
        where: { status: 'PENDING', expiresAt: { gt: new Date() } }, include: { policy: true, requestedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' },
      }),
      this.db.payment.findMany({
        where: { status: 'PENDING_APPROVAL' }, include: { client: { select: { displayName: true } }, createdBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' },
      }),
      this.db.refund.findMany({
        where: { status: 'REQUESTED' }, include: { payment: { include: { client: { select: { displayName: true } } } }, requestedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' },
      }),
    ]);
    const items: ApprovalInboxItem[] = [];
    for (const r of requests) {
      const d = await this.handlers.get(r.policyKey)?.describe(r.payload as Record<string, unknown>).catch(() => null);
      items.push({
        kind: 'APPROVAL', id: r.id, title: d?.title ?? r.policy.description, description: d?.description ?? '', policyKey: r.policyKey,
        amountMinor: d?.amountMinor ?? null, currency: d?.currency ?? null, requestedBy: r.requestedBy.fullName, createdAt: r.createdAt.toISOString(),
        resourceType: r.resourceType, resourceId: r.resourceId,
        canDecide: auth.permissions.has(r.policy.approverPermission) && (r.policy.allowSelfApproval || r.requestedById !== auth.userId),
      });
    }
    for (const p of payments) {
      items.push({
        kind: 'PAYMENT', id: p.id, title: `To'lov ${p.code}`, description: `${p.client.displayName} · ${p.method}${p.externalRef ? ` · ${p.externalRef}` : ''}`,
        policyKey: null, amountMinor: p.amountMinor.toString(), currency: p.currency, requestedBy: p.createdBy?.fullName ?? '—',
        createdAt: p.createdAt.toISOString(), resourceType: 'payment', resourceId: p.id, canDecide: auth.permissions.has('payments:approve'),
      });
    }
    for (const f of refunds) {
      items.push({
        kind: 'REFUND', id: f.id, title: `Refund: ${f.payment.code}`, description: `${f.payment.client.displayName} · ${f.reason}`, policyKey: 'refunds',
        amountMinor: f.amountMinor.toString(), currency: f.payment.currency, requestedBy: f.requestedBy.fullName, createdAt: f.createdAt.toISOString(),
        resourceType: 'payment', resourceId: f.paymentId, canDecide: auth.permissions.has('refunds:approve'),
      });
    }
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async history(limit = 50) {
    const rows = await this.db.approvalRequest.findMany({
      where: { status: { not: 'PENDING' } }, include: { requestedBy: { select: { fullName: true } }, decisions: { include: { approver: { select: { fullName: true } } } } },
      orderBy: { updatedAt: 'desc' }, take: limit,
    });
    return rows.map((r) => ({
      id: r.id, policyKey: r.policyKey, status: r.status, resourceType: r.resourceType, resourceId: r.resourceId, requestedBy: r.requestedBy.fullName,
      createdAt: r.createdAt.toISOString(), decidedAt: r.updatedAt.toISOString(),
      decisions: r.decisions.map((d) => ({ approver: d.approver.fullName, approve: d.approve, comment: d.comment, at: d.createdAt.toISOString() })),
    }));
  }
}
