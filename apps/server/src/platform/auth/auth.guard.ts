import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { env, mfaEnforced } from '../../config/env.js';
import { AuditService } from '../audit.service.js';
import { requestContext } from '../context.js';
import { Db } from '../db.service.js';
import { AppError } from '../errors.js';
import { ALLOW_MFA_PENDING, IS_PUBLIC, PERMISSIONS_KEY, SKIP_CSRF } from './decorators.js';
import { PermissionService } from './permission.service.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Global guard: sessiya → MFA → CSRF → ruxsatlar. Ruxsatsiz urinish audit qilinadi. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly perms: PermissionService,
    private readonly audit: AuditService,
    private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];

    // CSRF: mutatsiyalarda maxsus header + Origin tekshiruvi (cross-site sahifa header qo'sha olmaydi)
    if (!SAFE.has(req.method) && !this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, targets)) {
      const origin = req.headers.origin;
      const expected = (req.url ?? '').startsWith('/api/v1/portal/') ? env.PORTAL_ORIGIN : env.APP_ORIGIN; // har sirt faqat o'z origin'idan
      if (req.headers['x-ads-csrf'] !== '1' || (origin && origin !== expected)) {
        throw new AppError(403, 'CSRF', "So'rov rad etildi (CSRF)");
      }
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const token = req.cookies?.[SESSION_COOKIE];
    const session = token ? await this.sessions.findValid(token) : null;
    if (!session?.user || session.user.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHENTICATED', 'Tizimga kiring');

    const loaded = await this.perms.load(session.user.id);
    req.auth = {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      fullName: session.user.fullName,
      mfaVerified: !mfaEnforced || !!session.mfaVerifiedAt,
      permissions: loaded.perms,
    };
    requestContext.setActor({ type: 'STAFF', id: session.user.id, label: session.user.email });
    await this.sessions.touch(session.id, session.lastSeenAt, session.absoluteExpiresAt);

    if (!req.auth.mfaVerified && !this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING, targets)) {
      throw new AppError(401, 'MFA_REQUIRED', 'Ikki bosqichli tasdiqlash talab qilinadi');
    }
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = required.filter((p) => !loaded.perms.has(p));
    if (missing.length) {
      await this.audit.record(this.db, {
        action: 'access.denied',
        resourceType: 'route',
        resourceId: null,
        result: 'DENIED',
        metadata: { route: `${req.method} ${req.routeOptions?.url ?? req.url}`, missing },
      });
      throw new AppError(403, 'FORBIDDEN', `Ruxsat yo'q: ${missing.join(', ')}`);
    }
    return true;
  }
}
