import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Prisma } from '@ads/db';
import {
  type RequestCreateInput, type RequestDetail, type RequestListItem, type RequestListQuery, requestAssignSchema, requestListQuerySchema,
  type RequestMessageDto, requestMessageSchema, type RequestMessageInput, requestStatusSchema, staffRequestCreateSchema, type StaffRequestCreateInput,
} from '@ads/contracts';
import { AuditService } from '../../platform/audit.service.js';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db, type DbTx } from '../../platform/db.service.js';
import { badRequest, conflict, notFound } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { SequenceService } from '../../platform/sequence.service.js';
import { todayLocal, yearOf } from '../../platform/time.js';
import { ZodPipe } from '../../platform/zod.pipe.js';

const id = new ParseUUIDPipe();
const listInclude = {
  client: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, fullName: true } },
} satisfies Prisma.ClientRequestInclude;
type ListRow = Prisma.ClientRequestGetPayload<{ include: typeof listInclude }>;
type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

/** Kabinet foydalanuvchisi (sessiyadan) — clientId hech qachon so'rovdan olinmaydi. */
export interface PortalActor { portalUserId: string; clientId: string; fullName: string }

export const messageDto = (m: { id: string; author: 'CLIENT' | 'STAFF'; authorName: string; body: string; isInternal: boolean; createdAt: Date }): RequestMessageDto => ({
  id: m.id, author: m.author, authorName: m.authorName, body: m.body, internal: m.isInternal, createdAt: m.createdAt.toISOString(),
});

@Injectable()
export class RequestsService {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly seq: SequenceService) {}

  private item(r: ListRow): RequestListItem {
    return {
      id: r.id, code: r.code, client: { id: r.client.id, name: r.client.displayName }, category: r.category, subject: r.subject, status: r.status,
      lastMessageAt: r.lastMessageAt.toISOString(), lastMessageBy: r.lastMessageBy,
      unread: r.lastMessageBy === 'CLIENT' && r.status !== 'CLOSED' && (!r.staffSeenAt || r.staffSeenAt < r.lastMessageAt),
      assignee: r.assignee ? { id: r.assignee.id, name: r.assignee.fullName } : null, createdAt: r.createdAt.toISOString(),
    };
  }

  // ── Xodimlar ──
  async list(q: RequestListQuery, auth: AuthContext) {
    const status: Prisma.ClientRequestWhereInput = q.status === 'all' ? {} : q.status && q.status !== 'active' ? { status: q.status } : { status: { in: ['OPEN', 'IN_PROGRESS'] } };
    const where: Prisma.ClientRequestWhereInput = {
      ...status,
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.mine === 'true' ? { assigneeId: auth.userId } : {}),
      ...(q.q ? { OR: [
        { subject: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } },
        { client: { displayName: { contains: q.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.clientRequest.findMany({ where, include: listInclude, orderBy: [{ lastMessageAt: 'desc' }], ...pageArgs(q) }),
      this.db.clientRequest.count({ where }),
    ]);
    return paged(rows.map((r) => this.item(r)), total, q);
  }

  /** Sidebar belgisi: faol va javob kutayotgan (mijoz oxirgi yozgan, xodim hali ko'rmagan) murojaatlar. */
  async counts() {
    const [r] = await this.db.$queryRaw<{ active: bigint; unread: bigint }[]>`
      SELECT count(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS')) AS active,
             count(*) FILTER (WHERE status <> 'CLOSED' AND last_message_by = 'CLIENT'
                                AND (staff_seen_at IS NULL OR staff_seen_at < last_message_at)) AS unread
      FROM client_requests`;
    return { active: Number(r?.active ?? 0), unread: Number(r?.unread ?? 0) };
  }

  async get(requestId: string): Promise<RequestDetail> {
    const r = await this.db.clientRequest.findUnique({
      where: { id: requestId },
      include: {
        ...listInclude,
        subscription: { select: { id: true, code: true, clientProject: { select: { project: { select: { name: true } } } } } },
        device: { select: { id: true, code: true, name: true } },
        createdByPortalUser: { select: { fullName: true } }, createdByUser: { select: { fullName: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw notFound('Murojaat');
    const now = new Date();
    await this.db.$executeRaw`UPDATE client_requests SET staff_seen_at = ${now} WHERE id = ${r.id}::uuid`;
    return {
      ...this.item({ ...r, staffSeenAt: now }),
      subscription: r.subscription ? { id: r.subscription.id, code: r.subscription.code, projectName: r.subscription.clientProject.project.name } : null,
      device: r.device,
      createdBy: r.createdByPortalUser?.fullName ?? r.createdByUser?.fullName ?? '—',
      closedAt: r.closedAt?.toISOString() ?? null, rowVersion: r.rowVersion,
      messages: r.messages.map(messageDto),
    };
  }

  async createByStaff(input: StaffRequestCreateInput, auth: AuthContext) {
    if (!(await this.db.client.count({ where: { id: input.clientId, deletedAt: null } }))) throw notFound('Mijoz');
    const r = await this.db.$transaction((tx) => this.createIn(tx, { ...input, staff: { id: auth.userId, name: auth.fullName } }));
    return { id: r.id, code: r.code };
  }

  async reply(requestId: string, input: RequestMessageInput, auth: AuthContext) {
    return this.db.$transaction(async (tx) => {
      const r = await tx.clientRequest.findUnique({ where: { id: requestId } });
      if (!r) throw notFound('Murojaat');
      const now = new Date();
      const internal = !!input.internal;
      await tx.clientRequestMessage.create({
        data: { requestId, clientId: r.clientId, author: 'STAFF', authorUserId: auth.userId, authorName: auth.fullName, body: input.body, isInternal: internal, createdAt: now },
      });
      if (!internal) {
        await tx.clientRequest.update({
          where: { id: requestId },
          data: {
            lastMessageAt: now, lastMessageBy: 'STAFF', staffSeenAt: now,
            ...(r.status === 'OPEN' ? { status: 'IN_PROGRESS' as const } : {}),
            ...(r.status === 'CLOSED' ? { status: 'IN_PROGRESS' as const, closedAt: null } : {}),
            ...(r.assigneeId ? {} : { assigneeId: auth.userId }), // birinchi javob bergan xodim mas'ul bo'ladi
            rowVersion: { increment: 1 },
          },
        });
      }
      await this.audit.record(tx, { action: internal ? 'client_request.internal_note' : 'client_request.staff_reply', resourceType: 'client_request', resourceId: requestId });
      return { ok: true };
    });
  }

  async setStatus(requestId: string, status: Status) {
    const r = await this.db.clientRequest.findUnique({ where: { id: requestId } });
    if (!r) throw notFound('Murojaat');
    if (r.status === status) return { ok: true };
    await this.db.$transaction(async (tx) => {
      await tx.clientRequest.update({ where: { id: requestId }, data: { status, closedAt: status === 'CLOSED' ? new Date() : null, rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'client_request.status_changed', resourceType: 'client_request', resourceId: requestId, metadata: { from: r.status, to: status } });
    });
    return { ok: true };
  }

  async assign(requestId: string, assigneeId: string | null) {
    const r = await this.db.clientRequest.findUnique({ where: { id: requestId } });
    if (!r) throw notFound('Murojaat');
    if (assigneeId && !(await this.db.user.count({ where: { id: assigneeId, status: 'ACTIVE' } }))) throw badRequest('Xodim topilmadi yoki faol emas');
    await this.db.$transaction(async (tx) => {
      await tx.clientRequest.update({ where: { id: requestId }, data: { assigneeId, rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'client_request.assigned', resourceType: 'client_request', resourceId: requestId, metadata: { from: r.assigneeId, to: assigneeId } });
    });
    return { ok: true };
  }

  // ── Kabinet (mijoz) — yozish app_rw orqali, clientId FAQAT sessiyadan; o'qish PortalService'da (RLS) ──
  async createFromPortal(p: PortalActor, input: RequestCreateInput) {
    const r = await this.db.$transaction((tx) => this.createIn(tx, { ...input, clientId: p.clientId, portalUser: { id: p.portalUserId, name: p.fullName } }));
    return { id: r.id, code: r.code };
  }

  async replyFromPortal(p: PortalActor, requestId: string, body: string) {
    return this.db.$transaction(async (tx) => {
      const r = await tx.clientRequest.findFirst({ where: { id: requestId, clientId: p.clientId } });
      if (!r) throw notFound('Murojaat');
      if (r.status === 'CLOSED') throw conflict('Murojaat yopilgan — yangi murojaat oching');
      const now = new Date();
      const m = await tx.clientRequestMessage.create({
        data: { requestId, clientId: p.clientId, author: 'CLIENT', authorPortalUserId: p.portalUserId, authorName: p.fullName, body, createdAt: now },
      });
      await tx.clientRequest.update({
        where: { id: requestId },
        data: { lastMessageAt: now, lastMessageBy: 'CLIENT', clientSeenAt: now, ...(r.status === 'RESOLVED' ? { status: 'OPEN' as const } : {}), rowVersion: { increment: 1 } },
      });
      await this.audit.record(tx, { action: 'client_request.client_message', resourceType: 'client_request', resourceId: requestId });
      await this.outbox.add(tx, {
        type: 'client_request.client_message', eventKey: `client_request.client_message:${m.id}`, aggregateType: 'client_request', aggregateId: requestId,
        payload: { requestId, clientId: p.clientId, code: r.code, subject: r.subject },
      });
      return { ok: true };
    });
  }

  async closeFromPortal(p: PortalActor, requestId: string) {
    const r = await this.db.clientRequest.findFirst({ where: { id: requestId, clientId: p.clientId } });
    if (!r) throw notFound('Murojaat');
    if (r.status === 'CLOSED') return { ok: true };
    await this.db.$transaction(async (tx) => {
      await tx.clientRequest.update({ where: { id: requestId }, data: { status: 'CLOSED', closedAt: new Date(), rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'client_request.closed', resourceType: 'client_request', resourceId: requestId, metadata: { by: 'client' } });
    });
    return { ok: true };
  }

  async markClientSeen(requestId: string, clientId: string) {
    await this.db.$executeRaw`UPDATE client_requests SET client_seen_at = now() WHERE id = ${requestId}::uuid AND client_id = ${clientId}::uuid`;
  }

  /** Umumiy: murojaat + birinchi xabar + audit + outbox — bitta tranzaksiyada. Bog'liq obuna/qurilma egaligini DB trigger ham tekshiradi. */
  async createIn(tx: DbTx, d: RequestCreateInput & { clientId: string; portalUser?: { id: string; name: string }; staff?: { id: string; name: string } }) {
    if (d.subscriptionId && !(await tx.subscription.count({ where: { id: d.subscriptionId, clientId: d.clientId } }))) throw badRequest('Obuna topilmadi');
    if (d.deviceId && !(await tx.device.count({ where: { id: d.deviceId, clientId: d.clientId } }))) throw badRequest('Qurilma topilmadi');
    const code = await this.seq.code(tx, 'REQ', { year: yearOf(todayLocal()), width: 4 });
    const now = new Date();
    const byClient = !!d.portalUser;
    const author = (d.portalUser ?? d.staff)!;
    const r = await tx.clientRequest.create({
      data: {
        code, clientId: d.clientId, category: d.category, subject: d.subject, subscriptionId: d.subscriptionId ?? null, deviceId: d.deviceId ?? null,
        createdByPortalUserId: d.portalUser?.id ?? null, createdByUserId: d.staff?.id ?? null,
        lastMessageAt: now, lastMessageBy: byClient ? 'CLIENT' : 'STAFF', ...(byClient ? { clientSeenAt: now } : { staffSeenAt: now, assigneeId: d.staff!.id }),
      },
    });
    await tx.clientRequestMessage.create({
      data: {
        requestId: r.id, clientId: d.clientId, author: byClient ? 'CLIENT' : 'STAFF', authorPortalUserId: d.portalUser?.id ?? null,
        authorUserId: d.staff?.id ?? null, authorName: author.name, body: d.body, createdAt: now,
      },
    });
    await this.audit.record(tx, { action: 'client_request.created', resourceType: 'client_request', resourceId: r.id, metadata: { code, clientId: d.clientId, category: d.category } });
    await this.outbox.add(tx, {
      type: 'client_request.created', eventKey: `client_request.created:${r.id}`, aggregateType: 'client_request', aggregateId: r.id,
      payload: { requestId: r.id, clientId: d.clientId, code, subject: d.subject, byClient },
    });
    return r;
  }
}

@Controller('requests')
export class RequestsController {
  constructor(private readonly svc: RequestsService) {}

  @Get() @RequirePermissions('requests:read')
  list(@Query(new ZodPipe(requestListQuerySchema)) q: RequestListQuery, @Auth() a: AuthContext) { return this.svc.list(q, a); }

  @Get('counts') @RequirePermissions('requests:read')
  counts() { return this.svc.counts(); }

  @Get(':id') @RequirePermissions('requests:read')
  get(@Param('id', id) rid: string) { return this.svc.get(rid); }

  @Post() @RequirePermissions('requests:manage')
  create(@Body(new ZodPipe(staffRequestCreateSchema)) b: StaffRequestCreateInput, @Auth() a: AuthContext) { return this.svc.createByStaff(b, a); }

  @Post(':id/messages') @RequirePermissions('requests:manage')
  reply(@Param('id', id) rid: string, @Body(new ZodPipe(requestMessageSchema)) b: RequestMessageInput, @Auth() a: AuthContext) { return this.svc.reply(rid, b, a); }

  @Post(':id/status') @RequirePermissions('requests:manage')
  status(@Param('id', id) rid: string, @Body(new ZodPipe(requestStatusSchema)) b: { status: Status }) { return this.svc.setStatus(rid, b.status); }

  @Post(':id/assign') @RequirePermissions('requests:manage')
  assign(@Param('id', id) rid: string, @Body(new ZodPipe(requestAssignSchema)) b: { assigneeId: string | null }) { return this.svc.assign(rid, b.assigneeId); }
}

@Module({ controllers: [RequestsController], providers: [RequestsService], exports: [RequestsService] })
export class RequestsModule {}
