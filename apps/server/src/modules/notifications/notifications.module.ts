import { Body, Controller, Delete, Get, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown, Post, Query } from '@nestjs/common';
import { Bot } from 'grammy';
import { z } from 'zod';
import { formatMoney } from '@ads/contracts';
import { env } from '../../config/env.js';
import { Auth } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { EventBus } from '../../worker/event-bus.js';
import { NotificationsService } from './notifications.service.js';

const POLICY_TITLES: Record<string, string> = {
  credit_notes: 'Credit note', 'invoices.void': "Invoice'ni bekor qilish", 'deployments.production': 'Prod deployment', refunds: 'Refund',
};

/** Domain event'lar → kimga, nima (worker'da, outbox relay orqali). */
@Injectable()
export class NotificationHandlers implements OnApplicationBootstrap {
  constructor(private readonly bus: EventBus, private readonly n: NotificationsService, private readonly db: Db) {}

  private async requestRecipients(requestId: string) {
    const r = await this.db.clientRequest.findUnique({ where: { id: requestId }, select: { assigneeId: true, client: { select: { accountManagerId: true, displayName: true } } } });
    const managers = await this.n.usersWithPermission('requests:manage');
    const pick = [r?.assigneeId, r?.client.accountManagerId].find((x) => !!x && managers.includes(x));
    return { ids: pick ? [pick] : managers, client: r?.client.displayName ?? '' };
  }

  private async managerOrApprovers(clientId: string | undefined) {
    const c = clientId ? await this.db.client.findUnique({ where: { id: clientId }, select: { accountManagerId: true, displayName: true } }) : null;
    return { ids: c?.accountManagerId ? [c.accountManagerId] : await this.n.usersWithPermission('payments:approve'), client: c?.displayName ?? '' };
  }

  onApplicationBootstrap() {
    // Kabinetda o'zi ro'yxatdan o'tgan yangi mijoz (lid) — mijoz qo'sha oladiganlarga
    this.bus.on('client.self_registered', 'notify:self-registered', async (e) => {
      const p = e.payload as { clientId: string; name: string; email: string; phone: string };
      await this.n.notifyStaff({
        eventId: e.id, eventType: e.type, userIds: await this.n.usersWithPermission('clients:create'),
        title: "Yangi mijoz ro'yxatdan o'tdi", body: `${p.name} · ${p.phone} · ${p.email}`, link: `/clients/${p.clientId}`,
      });
    });
    // Mijoz murojaatlari: mas'ul (yoki mijoz menejeri) — bo'lmasa requests:manage ruxsati borlarga
    this.bus.on('client_request.created', 'notify:request-created', async (e) => {
      const p = e.payload as { requestId: string; code: string; subject: string; byClient: boolean };
      if (!p.byClient) return;
      const r = await this.requestRecipients(p.requestId);
      await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: r.ids, title: `Yangi murojaat ${p.code}`, body: `${r.client}: ${p.subject}`, link: `/requests/${p.requestId}` });
    });
    this.bus.on('client_request.client_message', 'notify:request-message', async (e) => {
      const p = e.payload as { requestId: string; code: string; subject: string };
      const r = await this.requestRecipients(p.requestId);
      await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: r.ids, title: `Mijoz javob yozdi · ${p.code}`, body: `${r.client}: ${p.subject}`, link: `/requests/${p.requestId}` });
    });
    this.bus.on('approval.requested', 'notify:approval', async (e) => {
      const r = await this.db.approvalRequest.findUnique({ where: { id: e.aggregateId }, include: { policy: true, requestedBy: { select: { fullName: true } } } });
      if (!r || r.status !== 'PENDING') return;
      const ids = (await this.n.usersWithPermission(r.policy.approverPermission)).filter((id) => r.policy.allowSelfApproval || id !== r.requestedById);
      await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: ids, title: `Tasdiq so'rovi: ${POLICY_TITLES[r.policyKey] ?? r.policyKey}`, body: `${r.requestedBy.fullName} tasdiq kutmoqda`, link: '/approvals' });
    });
    this.bus.on('payment.pending_approval', 'notify:payment-pending', async (e) => {
      const p = e.payload as { code: string; amountMinor: string; currency: 'UZS' | 'USD'; clientId: string };
      const c = await this.db.client.findUnique({ where: { id: p.clientId }, select: { displayName: true } });
      await this.n.notifyStaff({
        eventId: e.id, eventType: e.type, userIds: await this.n.usersWithPermission('payments:approve'),
        title: `To'lov tasdiq kutmoqda: ${p.code}`, body: `${c?.displayName ?? ''} · ${formatMoney(p.amountMinor, p.currency)}`, link: `/payments/${e.aggregateId}`,
      });
    });
    this.bus.on('refund.requested', 'notify:refund', async (e) => {
      await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: await this.n.usersWithPermission('refunds:approve'), title: "Refund so'rovi", body: 'Pulni qaytarish tasdiq kutmoqda', link: `/payments/${e.aggregateId}` });
    });
    this.bus.on('invoice.overdue', 'notify:overdue', async (e) => {
      const p = e.payload as { number: string; clientId: string };
      const { ids, client } = await this.managerOrApprovers(p.clientId);
      await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: ids, title: `Muddati o'tdi: ${p.number}`, body: `${client} — to'lov kechikmoqda`, link: `/invoices/${e.aggregateId}` });
    });
    this.bus.on(/^subscription\.(past_due|suspended)$/, 'notify:subscription', async (e) => {
      const p = e.payload as { clientId: string; code: string; to: string };
      const { ids, client } = await this.managerOrApprovers(p.clientId);
      const text = p.to === 'SUSPENDED' ? "to'xtatildi (qarz)" : "to'lovi kechikmoqda";
      await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: ids, title: `Obuna ${p.code} ${text}`, body: client, link: `/subscriptions/${e.aggregateId}` });
    });
    this.bus.on('payment.posted', 'notify:payment-posted', async (e) => {
      const p = e.payload as { code: string; clientId: string };
      const c = await this.db.client.findUnique({ where: { id: p.clientId }, select: { accountManagerId: true, displayName: true } });
      if (c?.accountManagerId) await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: [c.accountManagerId], title: `To'lov qabul qilindi: ${p.code}`, body: c.displayName, link: `/payments/${e.aggregateId}` });
    });
    this.bus.on(/^deployment\.(completed|failed|started|scheduled)$/, 'notify:deployment', async (e) => {
      const d = await this.db.deployment.findUnique({ where: { id: e.aggregateId }, include: { component: { select: { name: true } }, release: { select: { version: true } } } });
      if (!d) return;
      const t = { 'deployment.completed': 'yakunlandi', 'deployment.failed': 'xato bilan tugadi', 'deployment.started': 'boshlandi', 'deployment.scheduled': 'tasdiqlandi (rejada)' }[e.type] ?? e.type;
      await this.n.notifyStaff({ eventId: e.id, eventType: e.type, userIds: [d.createdById], title: `Deployment ${d.code} ${t}`, body: `${d.component.name} ${d.release.version}`, link: `/deployments/${d.id}` });
    });
  }
}

/** Telegram bot (faqat worker'da, long polling): /start <token> — akkauntni ulash; navbatdagi xabarlarni yuborish. */
@Injectable()
export class TelegramRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Telegram');
  private bot: Bot | null = null;
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly n: NotificationsService) {}

  async onApplicationBootstrap() {
    if (!env.TELEGRAM_BOT_TOKEN) { this.log.log("TELEGRAM_BOT_TOKEN yo'q — Telegram o'chirilgan (faqat tizim ichidagi bildirishnomalar)"); return; }
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    bot.command('start', async (ctx) => {
      const token = ctx.match?.trim();
      if (!token) { await ctx.reply("Salom! Bu ADS-ERP bildirishnoma boti. Ulash uchun tizimda: profil → «Telegram'ni ulash»."); return; }
      const name = await this.n.consumeLink(token, String(ctx.chat.id));
      await ctx.reply(name ? `✅ Ulandi: ${name}. Endi muhim bildirishnomalar shu yerga keladi.` : "❌ Havola yaroqsiz yoki muddati o'tgan. Tizimdan yangisini oling.");
    });
    bot.catch((err) => this.log.error(`bot: ${err.message}`));
    void bot.start({ drop_pending_updates: true, onStart: (i) => this.log.log(`Bot ishga tushdi: @${i.username}`) }).catch((e: Error) => this.log.error(`bot start: ${e.message}`));
    this.bot = bot;
    const tick = async () => {
      try { await this.n.flushTelegram((chatId, html) => bot.api.sendMessage(chatId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }).then(() => undefined)); }
      catch (e) { this.log.error(`flush: ${(e as Error).message}`); }
      this.timer = setTimeout(() => void tick(), 5000);
    };
    void tick();
  }

  async onApplicationShutdown() {
    if (this.timer) clearTimeout(this.timer);
    await this.bot?.stop().catch(() => undefined);
  }
}

@Controller()
export class NotificationsController {
  constructor(private readonly n: NotificationsService) {}

  @Get('notifications')
  list(@Auth() a: AuthContext, @Query(new ZodPipe(z.object({ unread: z.enum(['true', 'false']).optional() }))) q: { unread?: string }) { return this.n.list(a.userId, q.unread === 'true'); }

  @Post('notifications/read')
  read(@Auth() a: AuthContext, @Body(new ZodPipe(z.object({ ids: z.array(z.uuid()).max(100).optional() }))) b: { ids?: string[] }) { return this.n.markRead(a.userId, b.ids); }

  @Get('me/telegram') telegram(@Auth() a: AuthContext) { return this.n.telegramStatus(a.userId); }
  @Post('me/telegram/link') link(@Auth() a: AuthContext) { return this.n.telegramLink(a.userId); }
  @Delete('me/telegram') unlink(@Auth() a: AuthContext) { return this.n.telegramUnlink(a.userId); }
}

/** API: endpointlar. */
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}

/** Worker: event → bildirishnoma + Telegram bot. */
@Module({ providers: [NotificationsService, NotificationHandlers, TelegramRunner] })
export class NotificationsWorkerModule {}
