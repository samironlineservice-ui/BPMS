import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ads/db';
import { requestContext } from './context.js';
import type { DbOrTx } from './db.service.js';

const REDACT = new Set(['passwordHash', 'secretEnc', 'pinflEnc', 'tokenHash', 'codeHash', 'secretHash', 'password']);

/** before/after farqi (faqat o'zgargan maydonlar), sirlar redacted. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'rowVersion') continue;
    const bv = before?.[k];
    const av = after?.[k];
    if (JSON.stringify(bv, jsonSafe) === JSON.stringify(av, jsonSafe)) continue;
    b[k] = REDACT.has(k) ? '[REDACTED]' : bv;
    a[k] = REDACT.has(k) ? '[REDACTED]' : av;
  }
  return { before: before ? b : null, after: after ? a : null };
}
const jsonSafe = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result?: 'SUCCESS' | 'DENIED' | 'FAILED';
  reason?: string | null;
  changes?: { before: unknown; after: unknown } | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  /** Biznes o'zgarish bilan BITTA tranzaksiyada chaqiriladi. */
  async record(db: DbOrTx, e: AuditEntry) {
    const ctx = requestContext.get();
    await db.auditLog.create({
      data: {
        actorType: ctx.actor.type,
        actorId: ctx.actor.id,
        actorLabel: ctx.actor.label,
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300) ?? null,
        requestId: ctx.requestId,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId ?? null,
        result: e.result ?? 'SUCCESS',
        reason: e.reason ?? null,
        changes: (e.changes ? JSON.parse(JSON.stringify(e.changes, jsonSafe)) : undefined) as Prisma.InputJsonValue | undefined,
        metadata: (e.metadata ? JSON.parse(JSON.stringify(e.metadata, jsonSafe)) : undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
