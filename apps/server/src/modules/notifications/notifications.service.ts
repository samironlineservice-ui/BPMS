import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env.js';
import { randomToken, sha256Hex } from '../../platform/crypto.js';
import { Db } from '../../platform/db.service.js';
import { AppError } from '../../platform/errors.js';

export interface StaffNotice { eventId?: string | null; eventType: string; userIds: string[]; title: string; body: string; link?: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bildirishnomalar: tizim ichida (IN_APP) + Telegram (ulangan bo'lsa). Har kanal × qabul qiluvchi × event — bitta (dedupe). */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notify');
  private botUsername: string | null = null;
  constructor(private readonly db: Db) {}

  get telegramEnabled() { return !!env.TELEGRAM_BOT_TOKEN; }

  /** GLOBAL rol orqali ruxsati bor faol xodimlar (rahbar va u ruxsat berganlar). */
  async usersWithPermission(permission: string): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT u.id::text FROM users u JOIN user_role_assignments ura ON ura.user_id = u.id
        JOIN role_permissions rp ON rp.role_id = ura.role_id
       WHERE u.status = 'ACTIVE' AND rp.permission_key = ${permission} AND ura.scope_type = 'GLOBAL'
         AND (ura.expires_at IS NULL OR ura.expires_at > now())`;
    return rows.map((r) => r.id);
  }

  async notifyStaff(n: StaffNotice) {
    const userIds = [...new Set(n.userIds)];
    if (!userIds.length) return;
    const tg = this.telegramEnabled
      ? await this.db.channelIdentity.findMany({ where: { recipientType: 'STAFF', recipientId: { in: userIds }, channel: 'TELEGRAM', isActive: true } })
      : [];
    const data = n.link ? { link: n.link } : undefined;
    const key = (uid: string, ch: string) => (n.eventId ? `${n.eventId}:STAFF:${uid}:${ch}` : null);
    await this.db.notification.createMany({
      data: [
        ...userIds.map((uid) => ({
          eventId: n.eventId ?? null, eventType: n.eventType, recipientType: 'STAFF' as const, recipientId: uid, channel: 'IN_APP' as const,
          status: 'SENT' as const, sentAt: new Date(), title: n.title, body: n.body, data, dedupeKey: key(uid, 'IN_APP'),
        })),
        ...tg.map((c) => ({
          eventId: n.eventId ?? null, eventType: n.eventType, recipientType: 'STAFF' as const, recipientId: c.recipientId, channel: 'TELEGRAM' as const,
          title: n.title, body: n.body, data: { ...(data ?? {}), chatId: c.externalId }, dedupeKey: key(c.recipientId, 'TELEGRAM'),
        })),
      ],
      skipDuplicates: true,
    });
  }

  /** Navbatdagi Telegram xabarlarini yuborish (worker chaqiradi). */
  async flushTelegram(send: (chatId: string, html: string) => Promise<void>) {
    const queued = await this.db.notification.findMany({
      where: { channel: 'TELEGRAM', status: { in: ['QUEUED', 'FAILED'] }, attempts: { lt: 5 }, scheduledAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 25,
    });
    for (const q of queued) {
      const d = (q.data ?? {}) as { chatId?: string; link?: string };
      if (!d.chatId) continue;
      const html = `<b>${esc(q.title)}</b>\n${esc(q.body)}${d.link ? `\n\n${esc(env.APP_ORIGIN + d.link)}` : ''}`;
      try {
        await send(d.chatId, html);
        await this.db.notification.update({ where: { id: q.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } } });
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        await this.db.notification.update({
          where: { id: q.id }, data: { status: 'FAILED', attempts: { increment: 1 }, lastError: msg, scheduledAt: new Date(Date.now() + 60_000 * (q.attempts + 1) ** 2) },
        });
        this.log.warn(`telegram ${q.id}: ${msg}`);
      }
    }
    return queued.length;
  }

  async list(userId: string, unreadOnly: boolean) {
    const where = { recipientType: 'STAFF' as const, recipientId: userId, channel: 'IN_APP' as const, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, unread] = await Promise.all([
      this.db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.db.notification.count({ where: { recipientType: 'STAFF', recipientId: userId, channel: 'IN_APP', readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({ id: n.id, eventType: n.eventType, title: n.title, body: n.body, link: ((n.data ?? {}) as { link?: string }).link ?? null, createdAt: n.createdAt.toISOString(), read: !!n.readAt })),
    };
  }

  async markRead(userId: string, ids?: string[]) {
    await this.db.notification.updateMany({
      where: { recipientType: 'STAFF', recipientId: userId, channel: 'IN_APP', readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date(), status: 'READ' },
    });
    return { ok: true };
  }

  // ── Telegram ulash ──
  private async getBotUsername(): Promise<string> {
    if (this.botUsername) return this.botUsername;
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { ok: boolean; result?: { username: string } };
    if (!j.ok || !j.result) throw new AppError(502, 'TELEGRAM_UNAVAILABLE', 'Telegram bot javob bermadi (token tekshirilsin)');
    this.botUsername = j.result.username;
    return this.botUsername;
  }

  async telegramStatus(userId: string) {
    const link = await this.db.channelIdentity.findUnique({ where: { recipientType_recipientId_channel: { recipientType: 'STAFF', recipientId: userId, channel: 'TELEGRAM' } } });
    return { enabled: this.telegramEnabled, linked: !!link?.isActive, linkedAt: link?.verifiedAt.toISOString() ?? null };
  }

  async telegramLink(userId: string) {
    if (!this.telegramEnabled) throw new AppError(409, 'TELEGRAM_DISABLED', "Telegram bot sozlanmagan (TELEGRAM_BOT_TOKEN). Administratorga murojaat qiling.");
    const token = randomToken(18);
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.db.channelLinkToken.create({ data: { tokenHash: sha256Hex(token), recipientType: 'STAFF', recipientId: userId, channel: 'TELEGRAM', expiresAt } });
    return { url: `https://t.me/${await this.getBotUsername()}?start=${token}`, expiresAt: expiresAt.toISOString() };
  }

  async telegramUnlink(userId: string) {
    await this.db.channelIdentity.deleteMany({ where: { recipientType: 'STAFF', recipientId: userId, channel: 'TELEGRAM' } });
    return { ok: true };
  }

  /** Bot /start <token> — bir martalik, 10 daqiqalik token bilan chat'ni xodimga bog'laydi. */
  async consumeLink(token: string, chatId: string): Promise<string | null> {
    const t = await this.db.channelLinkToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (!t || t.usedAt || t.expiresAt < new Date() || t.channel !== 'TELEGRAM') return null;
    const used = await this.db.channelLinkToken.updateMany({ where: { tokenHash: t.tokenHash, usedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) return null;
    await this.db.channelIdentity.deleteMany({ where: { channel: 'TELEGRAM', OR: [{ externalId: chatId }, { recipientType: t.recipientType, recipientId: t.recipientId }] } });
    await this.db.channelIdentity.create({ data: { recipientType: t.recipientType, recipientId: t.recipientId, channel: 'TELEGRAM', externalId: chatId, verifiedAt: new Date() } });
    const u = await this.db.user.findUnique({ where: { id: t.recipientId }, select: { fullName: true } });
    return u?.fullName ?? 'xodim';
  }
}
