import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PortalAccess } from '@ads/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env, isProd } from '../../config/env.js';
import { requestContext } from '../../platform/context.js';
import { randomToken, sha256Hex } from '../../platform/crypto.js';
import { Db } from '../../platform/db.service.js';
import { AppError } from '../../platform/errors.js';

/** Portal sessiyasi xodimlarnikidan alohida cookie'da (bir xil host'da ham aralashmaydi). */
export const PORTAL_COOKIE = isProd ? '__Host-ads_psid' : 'ads_psid';
const IDLE_MIN = 60;
const ABSOLUTE_H = 24 * 7;

export type PortalRole = 'OWNER' | 'ACCOUNTANT' | 'TECHNICIAN' | 'VIEWER';
const PORTAL_ROLES = 'portal:roles';
/** Endpoint faqat shu kabinet rollariga ochiq (server tomonida majburiy; UI faqat yashiradi). */
export const PortalRoles = (...roles: PortalRole[]) => SetMetadata(PORTAL_ROLES, roles);
/** Moliya (invoice, to'lov, akt-sverka, narxlar): TECHNICIAN ko'rmaydi. */
export const FINANCE_ROLES: PortalRole[] = ['OWNER', 'ACCOUNTANT', 'VIEWER'];
/** Murojaat yozish: VIEWER faqat o'qiydi. */
export const WRITE_ROLES: PortalRole[] = ['OWNER', 'ACCOUNTANT', 'TECHNICIAN'];
/** Pul to'lash, obuna sotib olish, kartalarni boshqarish: faqat rahbar va buxgalter. */
export const PAY_ROLES: PortalRole[] = ['OWNER', 'ACCOUNTANT'];
export const accessOf = (role: string): PortalAccess => ({
  finance: (FINANCE_ROLES as string[]).includes(role), writeRequests: (WRITE_ROLES as string[]).includes(role), team: role === 'OWNER',
  pay: (PAY_ROLES as string[]).includes(role),
});

export interface PortalContext { portalUserId: string; clientId: string; email: string; fullName: string; role: string; sessionId: string }
declare module 'fastify' {
  interface FastifyRequest { portal?: PortalContext }
}

@Injectable()
export class PortalSessionService {
  constructor(private readonly db: Db) {}

  async create(portalUserId: string, req: FastifyRequest, reply: FastifyReply) {
    const token = randomToken(32);
    const now = Date.now();
    await this.db.session.create({
      data: {
        realm: 'PORTAL', portalUserId, tokenHash: sha256Hex(token), mfaVerifiedAt: new Date(), ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
        idleExpiresAt: new Date(now + IDLE_MIN * 60_000), absoluteExpiresAt: new Date(now + ABSOLUTE_H * 3_600_000),
      },
    });
    reply.setCookie(PORTAL_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/', maxAge: ABSOLUTE_H * 3600 });
  }

  async find(token: string) {
    const s = await this.db.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { portalUser: { include: { client: true } } } });
    const now = new Date();
    if (!s || s.realm !== 'PORTAL' || !s.portalUser || s.revokedAt || s.absoluteExpiresAt <= now || s.idleExpiresAt <= now) return null;
    if (s.portalUser.status !== 'ACTIVE' || s.portalUser.client.deletedAt) return null;
    if (now.getTime() - s.lastSeenAt.getTime() > 60_000) {
      const idle = new Date(Math.min(now.getTime() + IDLE_MIN * 60_000, s.absoluteExpiresAt.getTime()));
      await this.db.session.update({ where: { id: s.id }, data: { lastSeenAt: now, idleExpiresAt: idle } });
    }
    return s;
  }

  async revoke(token: string) {
    await this.db.session.updateMany({ where: { tokenHash: sha256Hex(token), revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'logout' } });
  }

  clear(reply: FastifyReply) {
    reply.clearCookie(PORTAL_COOKIE, { path: '/' });
  }
}

/** Portal endpointlari uchun guard (xodimlar guard'i @Public bilan chetlab o'tiladi). clientId FAQAT sessiyadan. */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly sessions: PortalSessionService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = req.cookies?.[PORTAL_COOKIE];
    const s = token ? await this.sessions.find(token) : null;
    if (!s?.portalUser) throw new AppError(401, 'UNAUTHENTICATED', 'Portalga kiring');
    req.portal = {
      portalUserId: s.portalUser.id, clientId: s.portalUser.clientId, email: s.portalUser.email, fullName: s.portalUser.fullName,
      role: s.portalUser.portalRole, sessionId: s.id,
    };
    requestContext.setActor({ type: 'PORTAL_USER', id: s.portalUser.id, label: s.portalUser.email });
    const roles = this.reflector.getAllAndOverride<PortalRole[] | undefined>(PORTAL_ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (roles && !roles.includes(s.portalUser.portalRole as PortalRole)) throw new AppError(403, 'PORTAL_FORBIDDEN', "Bu bo'lim sizning rolingiz uchun yopiq");
    return true;
  }
}

export const Portal = createParamDecorator((_d: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<FastifyRequest>().portal!);
export const portalOrigin = () => env.PORTAL_ORIGIN;
