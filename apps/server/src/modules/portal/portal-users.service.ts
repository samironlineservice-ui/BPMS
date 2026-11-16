import { Injectable } from '@nestjs/common';
import type { PortalUserDto, PortalUserInviteInput } from '@ads/contracts';
import { env } from '../../config/env.js';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { randomToken, sha256Hex } from '../../platform/crypto.js';
import { Db } from '../../platform/db.service.js';
import { badRequest, conflict, notFound } from '../../platform/errors.js';

const INVITE_HOURS = 72;

/** Mijozning kabinet foydalanuvchilari: xodimlar tomonidan (mijoz kartochkasi) va kabinet egasi tomonidan (jamoa) boshqariladi. */
@Injectable()
export class PortalUsersService {
  constructor(private readonly db: Db, private readonly audit: AuditService) {}

  dto(u: { id: string; email: string; fullName: string; portalRole: string; status: string; lastLoginAt: Date | null; createdAt: Date }): PortalUserDto {
    return { id: u.id, email: u.email, fullName: u.fullName, role: u.portalRole, status: u.status, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() };
  }

  async list(clientId: string) {
    const rows = await this.db.portalUser.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } });
    return rows.map((u) => this.dto(u));
  }

  /** Bir martalik taklif havolasi (72 soat). createdById — xodim; kabinet egasi taklif qilsa null (audit'da aktor saqlanadi). */
  async issueInvite(portalUserId: string, createdById: string | null) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + INVITE_HOURS * 3_600_000);
    await this.db.authToken.updateMany({ where: { portalUserId, purpose: 'INVITE', usedAt: null }, data: { usedAt: new Date() } });
    await this.db.authToken.create({ data: { tokenHash: sha256Hex(token), purpose: 'INVITE', portalUserId, expiresAt, createdById } });
    return { inviteUrl: `${env.PORTAL_ORIGIN}/invite?token=${token}`, expiresAt: expiresAt.toISOString() };
  }

  async create(clientId: string, input: Pick<PortalUserInviteInput, 'email' | 'fullName' | 'portalRole'> & { contactId?: string | null }, createdById: string | null, by: 'staff' | 'owner') {
    const client = await this.db.client.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!client) throw notFound('Mijoz');
    if (await this.db.portalUser.findFirst({ where: { email: input.email, status: { not: 'DEACTIVATED' } } })) throw conflict('Bu email bilan kabinet foydalanuvchisi mavjud');
    const u = await this.db.$transaction(async (tx) => {
      const created = await tx.portalUser.create({ data: { clientId, email: input.email, fullName: input.fullName, portalRole: input.portalRole, contactId: input.contactId ?? null } });
      await this.audit.record(tx, { action: 'portal_user.invited', resourceType: 'client', resourceId: clientId, metadata: { portalUserId: created.id, email: input.email, role: input.portalRole, by } });
      return created;
    });
    return { user: this.dto(u), ...(await this.issueInvite(u.id, createdById)) };
  }

  invite(clientId: string, input: PortalUserInviteInput, auth: AuthContext) {
    return this.create(clientId, input, auth.userId, 'staff');
  }

  async reinvite(portalUserId: string, createdById: string | null, clientId?: string) {
    const u = await this.db.portalUser.findFirst({ where: { id: portalUserId, ...(clientId ? { clientId } : {}) } });
    if (!u) throw notFound('Kabinet foydalanuvchisi');
    if (u.status !== 'INVITED') throw badRequest('Faqat taklif qilingan foydalanuvchiga yangi havola beriladi');
    await this.audit.record(this.db, { action: 'portal_user.reinvited', resourceType: 'client', resourceId: u.clientId, metadata: { portalUserId } });
    return this.issueInvite(portalUserId, createdById);
  }

  async setStatus(portalUserId: string, status: 'ACTIVE' | 'DEACTIVATED', clientId?: string) {
    const u = await this.db.portalUser.findFirst({ where: { id: portalUserId, ...(clientId ? { clientId } : {}) } });
    if (!u) throw notFound('Kabinet foydalanuvchisi');
    if (status === 'ACTIVE' && !u.passwordHash) throw badRequest('Foydalanuvchi hali taklifni qabul qilmagan');
    await this.db.$transaction(async (tx) => {
      await tx.portalUser.update({ where: { id: portalUserId }, data: { status, rowVersion: { increment: 1 } } });
      if (status === 'DEACTIVATED') await tx.session.updateMany({ where: { portalUserId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'deactivated' } });
      await this.audit.record(tx, { action: `portal_user.${status.toLowerCase()}`, resourceType: 'client', resourceId: u.clientId, metadata: { portalUserId } });
    });
    return { ok: true };
  }
}
