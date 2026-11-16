import { Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env, isProd } from '../../config/env.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { Db } from '../db.service.js';

export const SESSION_COOKIE = isProd ? '__Host-ads_sid' : 'ads_sid';

@Injectable()
export class SessionService {
  constructor(private readonly db: Db) {}

  async create(userId: string, req: FastifyRequest, reply: FastifyReply, opts: { mfaVerified: boolean }) {
    const token = randomToken(32);
    const now = Date.now();
    const session = await this.db.session.create({
      data: {
        realm: 'STAFF',
        userId,
        tokenHash: sha256Hex(token),
        mfaVerifiedAt: opts.mfaVerified ? new Date() : null,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
        idleExpiresAt: new Date(now + env.SESSION_IDLE_MINUTES * 60_000),
        absoluteExpiresAt: new Date(now + env.SESSION_ABSOLUTE_HOURS * 3_600_000),
      },
    });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: env.SESSION_ABSOLUTE_HOURS * 3600,
    });
    return session;
  }

  async findValid(token: string) {
    const s = await this.db.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
    const now = new Date();
    if (!s || s.realm !== 'STAFF' || !s.user || s.revokedAt || s.absoluteExpiresAt <= now) return null;
    // Idle muddat: absolute'dan oshmagan holda (birinchi tekshiruv)
    if (s.idleExpiresAt <= now) return null;
    return s;
  }

  /** Sliding idle expiry — har daqiqada ko'pi bilan bir marta yoziladi. */
  async touch(sessionId: string, lastSeenAt: Date, absoluteExpiresAt: Date) {
    if (Date.now() - lastSeenAt.getTime() < 60_000) return;
    const idle = new Date(Math.min(Date.now() + env.SESSION_IDLE_MINUTES * 60_000, absoluteExpiresAt.getTime()));
    await this.db.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date(), idleExpiresAt: idle } });
  }

  async revoke(sessionId: string, reason: string) {
    await this.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
  }
  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }
  clearCookie(reply: FastifyReply) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
