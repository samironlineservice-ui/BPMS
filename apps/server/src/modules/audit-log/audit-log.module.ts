import { Controller, Get, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { type AuditItem, listQuerySchema, type Paginated } from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { RequirePermissions } from '../../platform/auth/decorators.js';
import { Db } from '../../platform/db.service.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { ZodPipe } from '../../platform/zod.pipe.js';

const auditQuery = listQuerySchema.extend({
  actorId: z.uuid().optional(),
  action: z.string().max(80).optional(),
  resourceType: z.string().max(60).optional(),
  resourceId: z.uuid().optional(),
  result: z.enum(['SUCCESS', 'DENIED', 'FAILED']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

@Controller('audit')
export class AuditLogController {
  constructor(private readonly db: Db) {}

  @Get()
  @RequirePermissions('audit:read')
  async list(@Query(new ZodPipe(auditQuery)) q: z.infer<typeof auditQuery>): Promise<Paginated<AuditItem>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.resourceType ? { resourceType: q.resourceType } : {}),
      ...(q.resourceId ? { resourceId: q.resourceId } : {}),
      ...(q.result ? { result: q.result } : {}),
      ...(q.from || q.to ? { occurredAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(new Date(q.to).getTime() + 86_400_000) } : {}) } } : {}),
      ...(q.q ? { OR: [{ actorLabel: { contains: q.q, mode: 'insensitive' } }, { action: { contains: q.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { seq: 'desc' }], ...pageArgs(q) }),
      this.db.auditLog.count({ where }),
    ]);
    return paged(rows.map((r) => ({
      id: r.id, occurredAt: r.occurredAt.toISOString(), actorType: r.actorType, actorId: r.actorId, actorLabel: r.actorLabel, ip: r.ip,
      action: r.action, resourceType: r.resourceType, resourceId: r.resourceId, result: r.result, reason: r.reason,
      changes: r.changes, metadata: r.metadata, requestId: r.requestId,
    })), total, q);
  }
}

@Module({ controllers: [AuditLogController] })
export class AuditLogModule {}
