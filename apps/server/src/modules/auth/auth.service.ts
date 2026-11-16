import { Injectable } from '@nestjs/common';
import { hash, verify as argonVerify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { generateSecret, generateURI, verify as totpVerify } from 'otplib';
import type { AcceptInviteInput, AuthStep, LoginInput, MeResponse } from '@ads/contracts';
import { mfaEnforced } from '../../config/env.js';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { PermissionService } from '../../platform/auth/permission.service.js';
import { SessionService } from '../../platform/auth/session.service.js';
import { requestContext } from '../../platform/context.js';
import { decrypt, encrypt, KEY_VERSION, sha256Hex } from '../../platform/crypto.js';
import { Db } from '../../platform/db.service.js';
import { AppError } from '../../platform/errors.js';
import { rateLimit } from '../../platform/rate-limit.js';

export const ARGON = { memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;
export const hashPassword = (pw: string) => hash(pw, ARGON);
const INVALID = () => new AppError(401, 'INVALID_CREDENTIALS', "Email yoki parol noto'g'ri, yoki akkaunt vaqtincha bloklangan");

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly perms: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, req: FastifyRequest, reply: FastifyReply): Promise<{ step: AuthStep }> {
    rateLimit(`login:ip:${req.ip}`, 50, 15 * 60_000);
    rateLimit(`login:email:${input.email}`, 10, 15 * 60_000);
    const user = await this.db.user.findUnique({ where: { email: input.email }, include: { mfaFactors: true } });
    const now = new Date();
    if (!user || !user.passwordHash || user.status !== 'ACTIVE' || (user.lockedUntil && user.lockedUntil > now)) {
      await this.audit.record(this.db, { action: 'auth.login_failed', resourceType: 'user', resourceId: user?.id ?? null, result: 'FAILED', metadata: { email: input.email } });
      throw INVALID();
    }
    if (!(await argonVerify(user.passwordHash, input.password))) {
      const failed = user.failedLoginCount + 1;
      await this.db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: failed, lockedUntil: failed >= 10 ? new Date(now.getTime() + 15 * 60_000) : null },
      });
      await this.audit.record(this.db, { action: 'auth.login_failed', resourceType: 'user', resourceId: user.id, result: 'FAILED', metadata: { failed } });
      throw INVALID();
    }
    const hasMfa = user.mfaFactors.some((f) => f.confirmedAt);
    const step: AuthStep = !mfaEnforced ? 'DONE' : hasMfa ? 'MFA_VERIFY' : user.mfaRequired ? 'MFA_SETUP' : 'DONE';
    await this.db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
    await this.sessions.create(user.id, req, reply, { mfaVerified: mfaEnforced && step === 'DONE' });
    requestContext.setActor({ type: 'STAFF', id: user.id, label: user.email });
    await this.audit.record(this.db, { action: 'auth.login', resourceType: 'user', resourceId: user.id, metadata: mfaEnforced ? { step } : { step, mfa: 'disabled' } });
    return { step };
  }

  async mfaSetup(auth: AuthContext) {
    const existing = await this.db.mfaFactor.findFirst({ where: { userId: auth.userId, type: 'TOTP' } });
    if (existing?.confirmedAt) throw new AppError(409, 'MFA_EXISTS', 'Ikki bosqichli tasdiqlash allaqachon yoqilgan');
    const secret = generateSecret();
    if (existing) await this.db.mfaFactor.update({ where: { id: existing.id }, data: { secretEnc: encrypt(secret), keyVersion: KEY_VERSION } });
    else await this.db.mfaFactor.create({ data: { userId: auth.userId, type: 'TOTP', secretEnc: encrypt(secret), keyVersion: KEY_VERSION } });
    return { otpauthUrl: generateURI({ issuer: 'ADS-ERP', label: auth.email, secret }), secret };
  }

  async mfaConfirm(auth: AuthContext, code: string) {
    rateLimit(`mfa:${auth.userId}`, 10, 5 * 60_000);
    const f = await this.db.mfaFactor.findFirst({ where: { userId: auth.userId, type: 'TOTP', confirmedAt: null } });
    if (!f || !(await this.checkTotp(f, code))) throw new AppError(400, 'MFA_INVALID', "Kod noto'g'ri");
    await this.db.$transaction(async (tx) => {
      await tx.mfaFactor.update({ where: { id: f.id }, data: { confirmedAt: new Date() } });
      await tx.session.update({ where: { id: auth.sessionId }, data: { mfaVerifiedAt: new Date() } });
      await this.audit.record(tx, { action: 'auth.mfa_enabled', resourceType: 'user', resourceId: auth.userId });
    });
    return { ok: true };
  }

  async mfaVerify(auth: AuthContext, code: string) {
    rateLimit(`mfa:${auth.userId}`, 10, 5 * 60_000);
    const f = await this.db.mfaFactor.findFirst({ where: { userId: auth.userId, type: 'TOTP', confirmedAt: { not: null } } });
    if (!f || !(await this.checkTotp(f, code))) {
      await this.audit.record(this.db, { action: 'auth.mfa_failed', resourceType: 'user', resourceId: auth.userId, result: 'FAILED' });
      throw new AppError(400, 'MFA_INVALID', "Kod noto'g'ri");
    }
    await this.db.session.update({ where: { id: auth.sessionId }, data: { mfaVerifiedAt: new Date(), stepUpAt: new Date() } });
    await this.audit.record(this.db, { action: 'auth.mfa_verified', resourceType: 'user', resourceId: auth.userId });
    return { ok: true };
  }

  /** TOTP + replay himoyasi: bir xil vaqt qadamidagi kodni ikki marta qabul qilmaydi. */
  private async checkTotp(f: { id: string; secretEnc: Uint8Array; lastUsedStep: bigint | null }, code: string) {
    const r = (await totpVerify({ secret: decrypt(f.secretEnc), token: code, epochTolerance: 30 })) as { valid: boolean; timeStep?: number };
    if (!r.valid || r.timeStep === undefined) return false;
    const step = BigInt(r.timeStep);
    if (f.lastUsedStep !== null && step <= f.lastUsedStep) return false;
    await this.db.mfaFactor.update({ where: { id: f.id }, data: { lastUsedStep: step } });
    return true;
  }

  async inviteInfo(token: string) {
    const t = await this.db.authToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
    if (!t || t.purpose !== 'INVITE' || t.usedAt || t.expiresAt < new Date() || !t.user || t.user.status !== 'INVITED')
      throw new AppError(400, 'INVITE_INVALID', "Taklif havolasi yaroqsiz yoki muddati o'tgan");
    return { email: t.user.email, fullName: t.user.fullName };
  }

  async acceptInvite(input: AcceptInviteInput) {
    rateLimit(`invite:${sha256Hex(input.token).slice(0, 16)}`, 10, 15 * 60_000);
    const info = await this.inviteInfo(input.token);
    if (input.password.toLowerCase().includes(info.email.split('@')[0]!.toLowerCase())) {
      throw new AppError(400, 'WEAK_PASSWORD', "Parolda email nomi bo'lmasligi kerak");
    }
    const passwordHash = await hashPassword(input.password);
    await this.db.$transaction(async (tx) => {
      const t = await tx.authToken.findUniqueOrThrow({ where: { tokenHash: sha256Hex(input.token) } });
      const used = await tx.authToken.updateMany({ where: { tokenHash: t.tokenHash, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new AppError(400, 'INVITE_INVALID', 'Taklif havolasi allaqachon ishlatilgan');
      await tx.user.update({ where: { id: t.userId! }, data: { passwordHash, status: 'ACTIVE', passwordChangedAt: new Date() } });
      requestContext.setActor({ type: 'STAFF', id: t.userId!, label: info.email });
      await this.audit.record(tx, { action: 'user.invite_accepted', resourceType: 'user', resourceId: t.userId! });
    });
    return { ok: true, email: info.email };
  }

  /** Parolni almashtirish: joriy parol tekshiriladi, boshqa barcha sessiyalar yopiladi. */
  async changePassword(auth: AuthContext, currentPassword: string, newPassword: string) {
    rateLimit(`pwchange:${auth.userId}`, 5, 15 * 60_000);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const ok = !!user.passwordHash && (await argonVerify(user.passwordHash, currentPassword).catch(() => false));
    if (!ok) throw new AppError(400, 'WRONG_PASSWORD', "Joriy parol noto'g'ri");
    if (newPassword === currentPassword) throw new AppError(400, 'SAME_PASSWORD', "Yangi parol eskisidan farq qilishi kerak");
    if (newPassword.toLowerCase().includes(user.email.split('@')[0]!.toLowerCase())) throw new AppError(400, 'WEAK_PASSWORD', "Parolda email nomi bo'lmasligi kerak");
    const passwordHash = await hashPassword(newPassword);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: auth.sessionId } }, data: { revokedAt: new Date(), revokeReason: 'password_changed' } });
      await this.audit.record(tx, { action: 'auth.password_changed', resourceType: 'user', resourceId: user.id });
    });
    return { ok: true };
  }

  async logout(auth: AuthContext, reply: FastifyReply) {
    await this.sessions.revoke(auth.sessionId, 'logout');
    this.sessions.clearCookie(reply);
    await this.audit.record(this.db, { action: 'auth.logout', resourceType: 'user', resourceId: auth.userId });
    return { ok: true };
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: auth.userId }, include: { mfaFactors: true } });
    const loaded = await this.perms.load(auth.userId);
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, locale: user.locale, timezone: user.timezone },
      mfa: { enabled: user.mfaFactors.some((f) => f.confirmedAt), verified: auth.mfaVerified },
      permissions: [...loaded.perms].sort(),
      roles: loaded.roles.map((r) => ({ key: r.key, name: r.name, expiresAt: r.expiresAt?.toISOString() ?? null })),
    };
  }
}
