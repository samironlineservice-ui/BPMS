import { Injectable } from '@nestjs/common';
import type { AssignRoleInput, InviteResult, InviteUserInput, Paginated, SetUserPermissionsInput, UpdateUserInput, UserDetail, UserListItem } from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { env } from '../../config/env.js';
import { AuditService, diff } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { PermissionService } from '../../platform/auth/permission.service.js';
import { SessionService } from '../../platform/auth/session.service.js';
import { randomToken, sha256Hex } from '../../platform/crypto.js';
import { Db, type DbOrTx } from '../../platform/db.service.js';
import { AppError, badRequest, forbidden, notFound, staleVersion } from '../../platform/errors.js';
import { pageArgs, paged } from '../../platform/paging.js';

const userInclude = {
  mfaFactors: { select: { confirmedAt: true } },
  roleAssignments: { include: { role: true } },
} satisfies Prisma.UserInclude;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

const personalKey = (userId: string) => `u_${userId.replace(/-/g, '')}`;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toListItem(u: UserWithRoles): UserListItem {
  const now = Date.now();
  return {
    id: u.id, email: u.email, fullName: u.fullName, status: u.status, lastLoginAt: iso(u.lastLoginAt),
    mfaEnabled: u.mfaFactors.some((f) => f.confirmedAt),
    roles: u.roleAssignments
      .filter((a) => a.scopeType === 'GLOBAL' && (!a.expiresAt || a.expiresAt.getTime() > now))
      .map((a) => ({ id: a.role.id, key: a.role.key, name: a.role.name, isSystem: a.role.isSystem, expiresAt: iso(a.expiresAt) })),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly perms: PermissionService,
    private readonly sessions: SessionService,
  ) {}

  async list(q: { page: number; pageSize: number; q?: string; status?: string }): Promise<Paginated<UserListItem>> {
    const where: Prisma.UserWhereInput = {
      isServiceAccount: false,
      ...(q.status ? { status: q.status as Prisma.EnumUserStatusFilter['equals'] } : {}),
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { fullName: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.user.findMany({ where, include: userInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.db.user.count({ where }),
    ]);
    return paged(rows.map(toListItem), total, q);
  }

  /** Tanlash ro'yxatlari uchun (mas'ul menejer va h.k.) — har qanday xodimga ochiq. */
  async lookup(): Promise<{ id: string; fullName: string; email: string }[]> {
    return this.db.user.findMany({
      where: { status: 'ACTIVE', isServiceAccount: false }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' },
    });
  }

  async get(id: string, auth: AuthContext): Promise<UserDetail> {
    const u = await this.db.user.findUnique({
      where: { id },
      include: { ...userInclude, roleAssignments: { include: { role: { include: { permissions: true } }, grantedBy: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!u) throw notFound('Foydalanuvchi');
    const sessions = await this.db.session.findMany({
      where: { userId: id, revokedAt: null, absoluteExpiresAt: { gt: new Date() }, idleExpiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    const personal = u.roleAssignments.find((a) => a.role.key === personalKey(id));
    const base = toListItem(u as UserWithRoles);
    return {
      ...base,
      roles: undefined as never,
      phone: u.phone, locale: u.locale, rowVersion: u.rowVersion, createdAt: u.createdAt.toISOString(),
      assignments: u.roleAssignments.map((a) => ({
        id: a.id, role: { id: a.role.id, key: a.role.key, name: a.role.name, isSystem: a.role.isSystem },
        expiresAt: iso(a.expiresAt), grantedBy: a.grantedBy?.fullName ?? null, createdAt: a.createdAt.toISOString(),
        personal: a.role.key === personalKey(id),
      })),
      directPermissions: personal ? { permissions: personal.role.permissions.map((p) => p.permissionKey).sort(), expiresAt: iso(personal.expiresAt) } : null,
      sessions: sessions.map((s) => ({
        id: s.id, ip: s.ip, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString(),
        current: s.id === auth.sessionId,
      })),
    } as UserDetail;
  }

  /** Grantor faqat o'zida bor ruxsatlarni bera oladi (eskalatsiyaga qarshi). */
  private assertSubset(auth: AuthContext, perms: Iterable<string>) {
    const missing = [...perms].filter((p) => !auth.permissions.has(p));
    if (missing.length) throw forbidden(`Sizda yo'q ruxsatlarni bera olmaysiz: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
  }

  async invite(input: InviteUserInput, auth: AuthContext): Promise<InviteResult> {
    const roles = input.roleKeys.length
      ? await this.db.role.findMany({ where: { key: { in: input.roleKeys } }, include: { permissions: true } })
      : [];
    if (roles.length !== input.roleKeys.length) throw badRequest("Rol topilmadi");
    this.assertSubset(auth, roles.flatMap((r) => r.permissions.map((p) => p.permissionKey)));
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + 72 * 3600_000);
    const user = await this.db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: input.email, fullName: input.fullName, phone: input.phone ?? null, status: 'INVITED' } });
      for (const r of roles) await tx.userRoleAssignment.create({ data: { userId: u.id, roleId: r.id, grantedById: auth.userId } });
      await tx.authToken.create({ data: { tokenHash: sha256Hex(token), purpose: 'INVITE', userId: u.id, expiresAt, createdById: auth.userId } });
      await this.audit.record(tx, { action: 'user.invited', resourceType: 'user', resourceId: u.id, metadata: { email: u.email, roles: input.roleKeys } });
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, include: userInclude });
    });
    return { user: toListItem(user), inviteUrl: `${env.APP_ORIGIN}/invite?token=${token}`, expiresAt: expiresAt.toISOString() };
  }

  async reinvite(id: string, auth: AuthContext) {
    const u = await this.db.user.findUnique({ where: { id } });
    if (!u) throw notFound('Foydalanuvchi');
    if (u.status !== 'INVITED') throw badRequest('Faqat taklif qilingan foydalanuvchiga yangi havola beriladi');
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + 72 * 3600_000);
    await this.db.$transaction(async (tx) => {
      await tx.authToken.updateMany({ where: { userId: id, purpose: 'INVITE', usedAt: null }, data: { usedAt: new Date() } });
      await tx.authToken.create({ data: { tokenHash: sha256Hex(token), purpose: 'INVITE', userId: id, expiresAt, createdById: auth.userId } });
      await this.audit.record(tx, { action: 'user.reinvited', resourceType: 'user', resourceId: id });
    });
    return { inviteUrl: `${env.APP_ORIGIN}/invite?token=${token}`, expiresAt: expiresAt.toISOString() };
  }

  async update(id: string, input: UpdateUserInput) {
    const before = await this.db.user.findUnique({ where: { id } });
    if (!before) throw notFound('Foydalanuvchi');
    return this.db.$transaction(async (tx) => {
      const r = await tx.user.updateMany({
        where: { id, rowVersion: input.rowVersion },
        data: { fullName: input.fullName, phone: input.phone, locale: input.locale, rowVersion: { increment: 1 } },
      });
      if (r.count === 0) throw staleVersion();
      const after = await tx.user.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, { action: 'user.updated', resourceType: 'user', resourceId: id, changes: diff(before, after) });
      return { ok: true };
    });
  }

  async setStatus(id: string, status: 'ACTIVE' | 'DEACTIVATED', auth: AuthContext) {
    if (id === auth.userId) throw badRequest("O'z akkauntingiz holatini o'zgartira olmaysiz");
    const u = await this.db.user.findUnique({ where: { id } });
    if (!u) throw notFound('Foydalanuvchi');
    if (status === 'DEACTIVATED') await this.assertNotLastDirector(this.db, id);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status, rowVersion: { increment: 1 } } });
      if (status === 'DEACTIVATED') await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'deactivated' } });
      await this.audit.record(tx, { action: status === 'ACTIVE' ? 'user.activated' : 'user.deactivated', resourceType: 'user', resourceId: id });
    });
    this.perms.invalidate(id);
    return { ok: true };
  }

  async resetMfa(id: string, auth: AuthContext) {
    if (id === auth.userId) throw badRequest("O'z MFA'ingizni bu yerdan o'chira olmaysiz");
    await this.db.$transaction(async (tx) => {
      await tx.mfaFactor.deleteMany({ where: { userId: id } });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'mfa_reset' } });
      await this.audit.record(tx, { action: 'user.mfa_reset', resourceType: 'user', resourceId: id });
    });
    return { ok: true };
  }

  async assignRole(userId: string, input: AssignRoleInput, auth: AuthContext) {
    const [user, role] = await Promise.all([
      this.db.user.findUnique({ where: { id: userId } }),
      this.db.role.findUnique({ where: { id: input.roleId }, include: { permissions: true } }),
    ]);
    if (!user) throw notFound('Foydalanuvchi');
    if (!role || role.key.startsWith('u_')) throw notFound('Rol');
    this.assertSubset(auth, role.permissions.map((p) => p.permissionKey));
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw badRequest("Muddat kelajakda bo'lishi kerak");
    await this.db.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { userId, roleId: role.id, scopeType: 'GLOBAL' } });
      await tx.userRoleAssignment.create({ data: { userId, roleId: role.id, grantedById: auth.userId, expiresAt } });
      await this.audit.record(tx, { action: 'user.role_granted', resourceType: 'user', resourceId: userId, metadata: { role: role.key, expiresAt } });
    });
    this.perms.invalidate(userId);
    return { ok: true };
  }

  async revokeRole(userId: string, assignmentId: string, auth: AuthContext) {
    const a = await this.db.userRoleAssignment.findUnique({ where: { id: assignmentId }, include: { role: { include: { permissions: true } } } });
    if (!a || a.userId !== userId) throw notFound('Rol tayinlovi');
    this.assertSubset(auth, a.role.permissions.map((p) => p.permissionKey));
    if (a.role.key === 'director') await this.assertNotLastDirector(this.db, userId);
    await this.db.$transaction(async (tx) => {
      await tx.userRoleAssignment.delete({ where: { id: assignmentId } });
      await this.audit.record(tx, { action: 'user.role_revoked', resourceType: 'user', resourceId: userId, metadata: { role: a.role.key } });
    });
    this.perms.invalidate(userId);
    return { ok: true };
  }

  /** Rahbar foydalanuvchiga individual ruxsatlar beradi (doimiy yoki muddatli) — ichkarida shaxsiy rol. */
  async setDirectPermissions(userId: string, input: SetUserPermissionsInput, auth: AuthContext) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('Foydalanuvchi');
    const unknown = input.permissions.filter((p) => !p.includes(':'));
    if (unknown.length) throw badRequest("Noma'lum ruxsat");
    this.assertSubset(auth, input.permissions);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw badRequest("Muddat kelajakda bo'lishi kerak");
    const key = personalKey(userId);
    await this.db.$transaction(async (tx) => {
      let role = await tx.role.findUnique({ where: { key } });
      const before = role ? (await tx.rolePermission.findMany({ where: { roleId: role.id } })).map((p) => p.permissionKey) : [];
      if (!input.permissions.length) {
        if (role) {
          await tx.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
          await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
          await tx.role.delete({ where: { id: role.id } });
        }
      } else {
        role ??= await tx.role.create({ data: { key, name: `Shaxsiy: ${user.fullName}`, description: 'Rahbar bergan individual ruxsatlar', isSystem: false } });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({ data: input.permissions.map((p) => ({ roleId: role!.id, permissionKey: p })) });
        await tx.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
        await tx.userRoleAssignment.create({ data: { userId, roleId: role.id, grantedById: auth.userId, expiresAt } });
      }
      await this.audit.record(tx, {
        action: 'user.permissions_set', resourceType: 'user', resourceId: userId,
        changes: { before: { permissions: before }, after: { permissions: input.permissions, expiresAt } },
      });
    });
    this.perms.invalidate(userId);
    return { ok: true };
  }

  async revokeSession(userId: string, sessionId: string) {
    const s = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!s || s.userId !== userId) throw notFound('Sessiya');
    await this.sessions.revoke(sessionId, 'revoked_by_admin');
    await this.audit.record(this.db, { action: 'user.session_revoked', resourceType: 'user', resourceId: userId, metadata: { sessionId } });
    return { ok: true };
  }

  private async assertNotLastDirector(db: DbOrTx, userId: string) {
    const now = new Date();
    const directors = await db.userRoleAssignment.findMany({
      where: { role: { key: 'director' }, scopeType: 'GLOBAL', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    const others = new Set(directors.map((d) => d.userId).filter((id) => id !== userId));
    if (others.size === 0) throw new AppError(409, 'LAST_DIRECTOR', "Oxirgi faol rahbarni o'chirib bo'lmaydi");
  }
}
