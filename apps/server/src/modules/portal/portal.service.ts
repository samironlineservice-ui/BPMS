import { Injectable } from '@nestjs/common';
import { verify as argonVerify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@ads/db';
import {
  type AcceptInviteInput, clientUpsertSchema, mulDivRound, type PortalCompany, type PortalDashboard, type PortalDevice, type PortalInvoice, type PortalInvoiceDetail,
  type PortalMe, type PortalPayment, type PortalRequestDetail, type PortalRequestItem, type PortalSubscription, type PortalSubscriptionDetail,
  type PortalRegisterInput, type PortalSummary, type PortalTeamInviteInput, type PortalTeamMember, type RequestCreateInput,
} from '@ads/contracts';
import { env } from '../../config/env.js';
import { AuditService } from '../../platform/audit.service.js';
import { requestContext } from '../../platform/context.js';
import { sha256Hex } from '../../platform/crypto.js';
import { Db, PortalDb } from '../../platform/db.service.js';
import { AppError, badRequest, conflict, notFound } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { rateLimit } from '../../platform/rate-limit.js';
import { addMonths, dbDate, diffDays, fromDbDate, localDate, monthStart, todayLocal } from '../../platform/time.js';
import { hashPassword } from '../auth/auth.service.js';
import type { PendingChange } from '../billing/lifecycle.service.js';
import { InvoicePdfService } from '../billing/invoice-pdf.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { FilesService } from '../files/files.service.js';
import { FinanceService } from '../finance/finance.module.js';
import { StatementPdfService } from '../finance/statement-pdf.service.js';
import { messageDto, RequestsService } from '../requests/requests.module.js';
import { accessOf, type PortalContext, PortalSessionService } from './portal-auth.js';
import { PortalUsersService } from './portal-users.service.js';

const LIVE = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;
const VISIBLE = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;
const revItems = { items: { include: { planPrice: { include: { plan: true } } } } } satisfies Prisma.SubscriptionRevisionInclude;
const subInclude = {
  clientProject: { include: { project: { select: { id: true, name: true } } } },
  revisions: { where: { validTo: null }, include: revItems },
} satisfies Prisma.SubscriptionInclude;
type SubRow = Prisma.SubscriptionGetPayload<{ include: typeof subInclude }>;
type Item = { quantity: number; unitAmountMinor: bigint; discountBp: number; intervalMonths: number };

/** Oylik summa — MRR formulasi bilan bir xil: Σ round(miqdor × narx × (1 − chegirma) / interval). */
const monthlyOf = (items: Item[]) =>
  items.reduce((a, i) => a + mulDivRound(BigInt(i.quantity) * i.unitAmountMinor, BigInt(10_000 - i.discountBp), BigInt(10_000 * i.intervalMonths)), 0n);
/** Bitta hisob davri summasi (keyingi invoice taxmini, QQS 0). */
const periodOf = (items: Item[]) => items.reduce((a, i) => a + mulDivRound(BigInt(i.quantity) * i.unitAmountMinor, BigInt(10_000 - i.discountBp), 10_000n), 0n);
const itemsOf = (s: SubRow): Item[] =>
  (s.revisions[0]?.items ?? []).map((i) => ({ quantity: i.quantity, unitAmountMinor: i.unitAmountMinor, discountBp: i.discountBp, intervalMonths: i.planPrice.plan.intervalMonths }));

/** SemVer taqqoslash: a > b ? (prerelease relizdan oldin keladi). */
const sv = (v: string | null | undefined) => {
  const m = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?/.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? 0 : 1] : null;
};
const newer = (a: string | null | undefined, b: string | null | undefined) => {
  const x = sv(a); const y = sv(b);
  if (!x || !y) return false;
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
};
const add = (m: Map<string, bigint>, k: string, v: bigint) => m.set(k, (m.get(k) ?? 0n) + v);

@Injectable()
export class PortalService {
  constructor(
    private readonly db: Db, private readonly portalDb: PortalDb, private readonly audit: AuditService, private readonly sessions: PortalSessionService,
    private readonly finance: FinanceService, private readonly pdf: InvoicePdfService, private readonly files: FilesService,
    private readonly statementPdfSvc: StatementPdfService, private readonly requestsSvc: RequestsService, private readonly users: PortalUsersService,
    private readonly clients: ClientsService, private readonly outbox: OutboxService,
  ) {}

  // ── Kirish ──
  async login(email: string, password: string, req: FastifyRequest, reply: FastifyReply) {
    rateLimit(`portal-login:${req.ip}`, 20, 15 * 60_000);
    rateLimit(`portal-login:${email}`, 10, 15 * 60_000);
    const u = await this.db.portalUser.findFirst({ where: { email, status: { not: 'DEACTIVATED' } }, include: { client: true } });
    const ok = !!u?.passwordHash && (await argonVerify(u.passwordHash, password).catch(() => false));
    if (!u || !ok || u.status !== 'ACTIVE' || u.client.deletedAt) {
      await this.audit.record(this.db, { action: 'portal.login_failed', resourceType: 'portal_user', resourceId: u?.id ?? null, result: 'FAILED', metadata: { email } });
      throw new AppError(401, 'INVALID_CREDENTIALS', "Email yoki parol noto'g'ri");
    }
    await this.sessions.create(u.id, req, reply);
    await this.db.portalUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record(this.db, { action: 'portal.login', resourceType: 'portal_user', resourceId: u.id, metadata: { clientId: u.clientId } });
    return { ok: true };
  }

  config() { return { registration: env.PORTAL_REGISTRATION }; }

  /**
   * O'zi ro'yxatdan o'tish: YANGI "lid" mijoz + asosiy kontakt + egasi (OWNER) + (ixtiyoriy) birinchi murojaat — bitta tranzaksiyada,
   * keyin avtomatik kirish. Mavjud kompaniyaga (STIR yoki email bo'yicha) hech qachon ulanmaydi — buning uchun menejer taklifi kerak.
   */
  async register(input: PortalRegisterInput, req: FastifyRequest, reply: FastifyReply) {
    if (!env.PORTAL_REGISTRATION) throw new AppError(403, 'REGISTRATION_DISABLED', "Ro'yxatdan o'tish yopiq — kabinetga kirish uchun menejeringizdan taklif so'rang");
    rateLimit(`portal-register:${req.ip}`, 5, 60 * 60_000);
    rateLimit(`portal-register:${input.email}`, 3, 60 * 60_000);
    if (input.password.toLowerCase().includes(input.email.split('@')[0]!.toLowerCase())) throw new AppError(400, 'WEAK_PASSWORD', "Parolda email nomi bo'lmasligi kerak");
    if (await this.db.portalUser.findFirst({ where: { email: input.email, status: { not: 'DEACTIVATED' } } })) {
      throw conflict("Bu email bilan kabinet allaqachon mavjud — «Kirish» sahifasidan kiring");
    }
    if (input.tin && (await this.db.client.findFirst({ where: { tin: input.tin, deletedAt: null } }))) {
      throw conflict("Bu STIR bo'yicha kompaniya allaqachon tizimda. Kabinetga kirish uchun menejeringizdan taklif so'rang");
    }
    const passwordHash = await hashPassword(input.password);
    const name = input.type === 'COMPANY' ? input.companyName!.trim() : input.fullName;
    requestContext.setActor({ type: 'SYSTEM', id: null, label: `kabinet: ro'yxatdan o'tish (${input.email})` });
    const out = await this.db.$transaction(async (tx) => {
      const c = await this.clients.createIn(tx, clientUpsertSchema.parse({
        type: input.type, status: 'LEAD', legalName: name, displayName: name.slice(0, 120), tin: input.tin ?? null,
        phone: input.phone, billingEmail: input.email, tags: ['kabinet orqali'],
      }));
      const contact = await tx.clientContact.create({
        data: { clientId: c.id, fullName: input.fullName, position: input.position || null, phone: input.phone, email: input.email, isPrimary: true, isBilling: true },
      });
      // emailVerifiedAt — null: email tasdiqlanmagan (email yuborish ulanganda tasdiqlash qo'shiladi)
      const u = await tx.portalUser.create({
        data: { clientId: c.id, contactId: contact.id, email: input.email, fullName: input.fullName, portalRole: 'OWNER', status: 'ACTIVE', passwordHash },
      });
      requestContext.setActor({ type: 'PORTAL_USER', id: u.id, label: input.email });
      await this.audit.record(tx, { action: 'portal.registered', resourceType: 'client', resourceId: c.id, metadata: { portalUserId: u.id, email: input.email, code: c.code } });
      if (input.message) {
        await this.requestsSvc.createIn(tx, {
          clientId: c.id, category: 'CHANGE', subject: "Xizmatga ulanish so'rovi", body: input.message, subscriptionId: null, deviceId: null,
          portalUser: { id: u.id, name: input.fullName },
        });
      }
      await this.outbox.add(tx, {
        type: 'client.self_registered', eventKey: `client.self_registered:${c.id}`, aggregateType: 'client', aggregateId: c.id,
        payload: { clientId: c.id, code: c.code, name, email: input.email, phone: input.phone },
      });
      return { userId: u.id };
    });
    await this.sessions.create(out.userId, req, reply);
    await this.db.portalUser.update({ where: { id: out.userId }, data: { lastLoginAt: new Date() } });
    return { ok: true };
  }

  async inviteInfo(token: string) {
    const t = await this.db.authToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { portalUser: { include: { client: true } } } });
    if (!t || t.purpose !== 'INVITE' || t.usedAt || t.expiresAt < new Date() || !t.portalUser || t.portalUser.status !== 'INVITED') {
      throw new AppError(400, 'INVITE_INVALID', "Taklif havolasi yaroqsiz yoki muddati o'tgan");
    }
    return { email: t.portalUser.email, fullName: t.portalUser.fullName, clientName: t.portalUser.client.displayName, t };
  }

  async acceptInvite(input: AcceptInviteInput) {
    rateLimit(`portal-invite:${sha256Hex(input.token).slice(0, 16)}`, 10, 15 * 60_000);
    const { t, email } = await this.inviteInfo(input.token);
    if (input.password.toLowerCase().includes(email.split('@')[0]!.toLowerCase())) throw new AppError(400, 'WEAK_PASSWORD', "Parolda email nomi bo'lmasligi kerak");
    const passwordHash = await hashPassword(input.password);
    await this.db.$transaction(async (tx) => {
      const used = await tx.authToken.updateMany({ where: { tokenHash: t.tokenHash, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new AppError(400, 'INVITE_INVALID', 'Taklif havolasi allaqachon ishlatilgan');
      await tx.portalUser.update({ where: { id: t.portalUserId! }, data: { passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() } });
      await this.audit.record(tx, { action: 'portal_user.invite_accepted', resourceType: 'portal_user', resourceId: t.portalUserId! });
    });
    return { ok: true, email };
  }

  /** Parolni almashtirish: joriy parol tekshiriladi, boshqa barcha kabinet sessiyalari yopiladi. */
  async changePassword(p: PortalContext, currentPassword: string, newPassword: string) {
    rateLimit(`portal-pw:${p.portalUserId}`, 5, 15 * 60_000);
    const u = await this.db.portalUser.findUniqueOrThrow({ where: { id: p.portalUserId } });
    const ok = !!u.passwordHash && (await argonVerify(u.passwordHash, currentPassword).catch(() => false));
    if (!ok) throw new AppError(400, 'WRONG_PASSWORD', "Joriy parol noto'g'ri");
    if (newPassword === currentPassword) throw new AppError(400, 'SAME_PASSWORD', 'Yangi parol eskisidan farq qilishi kerak');
    if (newPassword.toLowerCase().includes(u.email.split('@')[0]!.toLowerCase())) throw new AppError(400, 'WEAK_PASSWORD', "Parolda email nomi bo'lmasligi kerak");
    const passwordHash = await hashPassword(newPassword);
    await this.db.$transaction(async (tx) => {
      await tx.portalUser.update({ where: { id: u.id }, data: { passwordHash, rowVersion: { increment: 1 } } });
      await tx.session.updateMany({ where: { portalUserId: u.id, revokedAt: null, id: { not: p.sessionId } }, data: { revokedAt: new Date(), revokeReason: 'password_changed' } });
      await this.audit.record(tx, { action: 'portal.password_changed', resourceType: 'portal_user', resourceId: u.id });
    });
    return { ok: true };
  }

  async me(p: PortalContext): Promise<PortalMe> {
    const c = await this.portalDb.forClient(p.clientId, (tx) => tx.client.findFirstOrThrow({ where: { id: p.clientId } }));
    return {
      user: { id: p.portalUserId, email: p.email, fullName: p.fullName, role: p.role },
      client: { id: c.id, code: c.code, name: c.displayName, legalName: c.legalName, accountNo: c.accountNo, billingCurrency: c.billingCurrency },
      access: accessOf(p.role),
    };
  }

  /** Kompaniya rekvizitlari (to'lov yo'riqnomasi uchun). */
  async company(): Promise<PortalCompany> {
    const c = ((await this.db.setting.findUnique({ where: { key: 'company.profile' } }))?.value ?? {}) as Record<string, unknown>;
    const v = (k: string) => (typeof c[k] === 'string' && c[k] ? (c[k] as string) : null);
    return {
      name: v('name'), legalName: v('legalName'), tin: v('tin'), address: v('address'), bankName: v('bankName'), bankMfo: v('bankMfo'),
      bankAccount: v('bankAccount'), phone: v('phone'), email: v('email'),
    };
  }

  // ── Moliya ──
  private invoice(i: { id: string; number: string | null; kind: string; status: string; currency: string; totalMinor: bigint; paidMinor: bigint; creditedMinor: bigint; issueDate: Date | null; dueDate: Date | null; periodStart: Date | null; periodEnd: Date | null }, today: string): PortalInvoice {
    const out = i.status === 'VOID' ? 0n : i.totalMinor - i.paidMinor - i.creditedMinor;
    const due = fromDbDate(i.dueDate);
    return {
      id: i.id, number: i.number, kind: i.kind, status: i.status, currency: i.currency, totalMinor: i.totalMinor.toString(), paidMinor: i.paidMinor.toString(),
      creditedMinor: i.creditedMinor.toString(), outstandingMinor: out.toString(), issueDate: fromDbDate(i.issueDate), dueDate: due,
      periodStart: fromDbDate(i.periodStart), periodEnd: fromDbDate(i.periodEnd), overdueDays: out > 0n && due && due < today ? diffDays(due, today) : 0,
    };
  }

  /** Valyuta bo'yicha: qarz, muddati o'tgan, avans (taqsimlanmagan to'lovlar). */
  private balances(
    inv: { currency: string; totalMinor: bigint; paidMinor: bigint; creditedMinor: bigint; dueDate: Date | null }[],
    pays: { currency: string; amountMinor: bigint; allocatedMinor: bigint; refundedMinor: bigint }[], today: string,
  ) {
    const cur = new Map<string, { receivable: bigint; overdue: bigint; credit: bigint; open: number }>();
    const get = (c: string) => cur.get(c) ?? cur.set(c, { receivable: 0n, overdue: 0n, credit: 0n, open: 0 }).get(c)!;
    for (const i of inv) {
      const b = get(i.currency); const out = i.totalMinor - i.paidMinor - i.creditedMinor;
      b.receivable += out; b.open++; if (fromDbDate(i.dueDate)! < today) b.overdue += out;
    }
    for (const x of pays) { const left = x.amountMinor - x.allocatedMinor - x.refundedMinor; if (left > 0n) get(x.currency).credit += left; }
    return [...cur.entries()].map(([currency, b]) => ({ currency, receivableMinor: b.receivable.toString(), overdueMinor: b.overdue.toString(), creditMinor: b.credit.toString(), openInvoices: b.open }));
  }

  async summary(p: PortalContext): Promise<PortalSummary> {
    const today = todayLocal();
    return this.portalDb.forClient(p.clientId, async (tx) => {
      const [inv, pays, subs, devices, last] = await Promise.all([
        tx.invoice.findMany({ where: { status: { in: ['OPEN', 'UNCOLLECTIBLE'] } }, select: { currency: true, totalMinor: true, paidMinor: true, creditedMinor: true, dueDate: true } }),
        tx.payment.findMany({ where: { status: 'POSTED' }, select: { currency: true, amountMinor: true, allocatedMinor: true, refundedMinor: true } }),
        tx.subscription.count({ where: { status: { in: [...VISIBLE] } } }),
        tx.device.count({ where: { status: 'ACTIVE' } }),
        tx.payment.findFirst({ where: { status: 'POSTED' }, orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }] }),
      ]);
      return {
        balances: this.balances(inv, pays, today), subscriptions: subs, devices,
        lastPayment: last ? { code: last.code, amountMinor: last.amountMinor.toString(), currency: last.currency, receivedAt: last.receivedAt.toISOString() } : null,
      };
    });
  }

  /** Bosh sahifa: holat, moliya (rolga qarab), xizmatlar, qurilmalar, murojaatlar. */
  async dashboard(p: PortalContext): Promise<PortalDashboard> {
    const access = accessOf(p.role);
    const today = todayLocal();
    const from = addMonths(monthStart(today), -11);
    const data = await this.portalDb.forClient(p.clientId, async (tx) => {
      const [subs, open, pays, hist, recent, req] = await Promise.all([
        tx.subscription.findMany({ where: { status: { in: [...VISIBLE] } }, include: subInclude, orderBy: { createdAt: 'asc' } }),
        access.finance ? tx.invoice.findMany({ where: { status: { in: ['OPEN', 'UNCOLLECTIBLE'] } }, orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }] }) : Promise.resolve([]),
        access.finance ? tx.payment.findMany({ where: { status: 'POSTED' }, select: { currency: true, amountMinor: true, allocatedMinor: true, refundedMinor: true } }) : Promise.resolve([]),
        access.finance
          ? tx.invoice.findMany({ where: { status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: dbDate(from) } }, select: { issueDate: true, currency: true, totalMinor: true, paidMinor: true, creditedMinor: true } })
          : Promise.resolve([]),
        access.finance ? tx.payment.findMany({ where: { status: 'POSTED' }, orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }], take: 5 }) : Promise.resolve([]),
        tx.$queryRaw<{ open: bigint; unread: bigint }[]>`
          SELECT count(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS')) AS open,
                 count(*) FILTER (WHERE status <> 'CLOSED' AND last_message_by = 'STAFF' AND (client_seen_at IS NULL OR client_seen_at < last_message_at)) AS unread
          FROM client_requests`,
      ]);
      return { subs, open, pays, hist, recent, req: req[0] };
    });
    const devices = await this.deviceRows(p.clientId);
    const live = data.subs.filter((s) => (LIVE as readonly string[]).includes(s.status));

    let finance: PortalDashboard['finance'] = null;
    if (access.finance) {
      const monthly = new Map<string, bigint>();
      for (const s of live) add(monthly, s.currency, monthlyOf(itemsOf(s)));
      // Keyingi hisob: eng yaqin sana; rejalashtirilgan o'zgarish shu sanadan kuchga kirsa — yangi qatorlar bo'yicha
      const dated = live.filter((s) => s.nextBillingOn);
      const next = dated.map((s) => fromDbDate(s.nextBillingOn)!).sort()[0];
      const nextAmounts = new Map<string, bigint>();
      for (const s of dated.filter((x) => fromDbDate(x.nextBillingOn) === next)) {
        const pc = s.pendingChange as PendingChange | null;
        const items = pc && pc.effectiveOn <= next! ? await this.pendingItems(p.clientId, pc) : itemsOf(s);
        add(nextAmounts, s.currency, periodOf(items));
      }
      const hist = new Map<string, { invoiced: bigint; paid: bigint; out: bigint }>();
      for (const i of data.hist) {
        const k = `${fromDbDate(i.issueDate)!.slice(0, 7)}-01|${i.currency}`;
        const h = hist.get(k) ?? hist.set(k, { invoiced: 0n, paid: 0n, out: 0n }).get(k)!;
        h.invoiced += i.totalMinor; h.paid += i.paidMinor + i.creditedMinor; h.out += i.totalMinor - i.paidMinor - i.creditedMinor;
      }
      const currencies = [...new Set(data.hist.map((i) => i.currency))];
      const months = Array.from({ length: 12 }, (_, k) => addMonths(from, k));
      finance = {
        balances: this.balances(data.open, data.pays, today),
        monthly: [...monthly.entries()].map(([currency, v]) => ({ currency, amountMinor: v.toString() })),
        nextCharge: next ? { date: next, amounts: [...nextAmounts.entries()].map(([currency, v]) => ({ currency, amountMinor: v.toString() })) } : null,
        history: currencies.flatMap((currency) => months.map((month) => {
          const h = hist.get(`${month}|${currency}`);
          return { month, currency, invoicedMinor: (h?.invoiced ?? 0n).toString(), paidMinor: (h?.paid ?? 0n).toString(), outstandingMinor: (h?.out ?? 0n).toString() };
        })),
        openInvoices: data.open.slice(0, 5).map((i) => this.invoice(i, today)),
        recentPayments: data.recent.map((x) => ({ id: x.id, code: x.code, method: x.method, currency: x.currency, amountMinor: x.amountMinor.toString(), receivedAt: x.receivedAt.toISOString() })),
      };
    }
    const suspended = data.subs.some((s) => s.status === 'SUSPENDED');
    const bal = finance?.balances ?? [];
    const status: PortalDashboard['status'] = suspended ? 'SUSPENDED'
      : bal.some((b) => b.overdueMinor !== '0') ? 'OVERDUE'
        : bal.some((b) => b.receivableMinor !== '0') ? 'DUE' : 'OK';
    return {
      status, finance,
      services: data.subs.map((s) => ({
        id: s.id, code: s.code, projectName: s.clientProject.project.name, status: s.status, currency: s.currency,
        mrrMinor: access.finance ? monthlyOf(itemsOf(s)).toString() : null, nextBillingOn: fromDbDate(s.nextBillingOn), trialEndsOn: fromDbDate(s.trialEndsOn),
        cancelAtPeriodEnd: s.cancelAtPeriodEnd, pendingChangeOn: (s.pendingChange as PendingChange | null)?.effectiveOn ?? null,
      })),
      devices: { total: devices.length, updatesAvailable: devices.reduce((a, d) => a + d.installations.filter((i) => i.updateAvailable).length, 0) },
      requests: { open: Number(data.req?.open ?? 0), unread: Number(data.req?.unread ?? 0) },
    };
  }

  private async pendingItems(clientId: string, pc: PendingChange): Promise<(Item & { planName: string })[]> {
    const prices = await this.portalDb.forClient(clientId, (tx) => tx.planPrice.findMany({ where: { id: { in: pc.items.map((i) => i.planPriceId) } }, include: { plan: true } }));
    const byId = new Map(prices.map((x) => [x.id, x]));
    return pc.items.map((i) => ({
      planName: byId.get(i.planPriceId)?.plan.name ?? '—', quantity: i.quantity, unitAmountMinor: BigInt(i.unitAmountMinor), discountBp: i.discountBp,
      intervalMonths: byId.get(i.planPriceId)?.plan.intervalMonths ?? 1,
    }));
  }

  async invoices(p: PortalContext, status?: string): Promise<PortalInvoice[]> {
    const today = todayLocal();
    const rows = await this.portalDb.forClient(p.clientId, (tx) => tx.invoice.findMany({
      where: status === 'open' || status === 'overdue' ? { status: { in: ['OPEN', 'UNCOLLECTIBLE'] }, ...(status === 'overdue' ? { dueDate: { lt: dbDate(today) } } : {}) } : { status: { not: 'DRAFT' } },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take: 300,
    }));
    return rows.map((r) => this.invoice(r, today));
  }

  async invoiceDetail(p: PortalContext, invoiceId: string): Promise<PortalInvoiceDetail> {
    const today = todayLocal();
    return this.portalDb.forClient(p.clientId, async (tx) => {
      const i = await tx.invoice.findFirst({ where: { id: invoiceId, status: { not: 'DRAFT' } }, include: { lines: { orderBy: { position: 'asc' } } } });
      if (!i) throw notFound('Invoice'); // RLS: boshqa mijozniki — topilmaydi
      const allocs = await tx.allocation.findMany({ where: { invoiceId, reversalOfId: null, reversedBy: null }, include: { payment: { select: { code: true } } }, orderBy: { appliedAt: 'asc' } });
      return {
        ...this.invoice(i, today), subtotalMinor: i.subtotalMinor.toString(), vatMinor: i.vatMinor.toString(), fxRate: i.fxRate?.toString() ?? null,
        totalUzsMinor: i.totalUzsMinor?.toString() ?? null,
        lines: i.lines.map((l) => ({
          position: l.position, description: l.description, quantity: l.quantity, unitAmountMinor: l.unitAmountMinor.toString(), amountMinor: l.amountMinor.toString(),
          vatMinor: l.vatMinor.toString(), prorationNum: l.prorationNum, prorationDen: l.prorationDen,
        })),
        payments: allocs.map((a) => ({ code: a.payment.code, amountMinor: a.amountInvoiceMinor.toString(), currency: a.invoiceCurrency, appliedAt: a.appliedAt.toISOString() })),
      };
    });
  }

  /** PDF: avval RLS orqali egalik tekshiriladi, keyin umumiy (o'zgarmas) PDF fayli beriladi. */
  async invoicePdf(p: PortalContext, invoiceId: string) {
    const owned = await this.portalDb.forClient(p.clientId, (tx) => tx.invoice.count({ where: { id: invoiceId, status: { not: 'DRAFT' } } }));
    if (!owned) throw notFound('Invoice');
    const fileId = await this.pdf.fileFor(invoiceId);
    return this.files.openForDownload(fileId);
  }

  async payments(p: PortalContext): Promise<PortalPayment[]> {
    const rows = await this.portalDb.forClient(p.clientId, (tx) => tx.payment.findMany({
      where: { status: 'POSTED' }, orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }], take: 300,
      include: { allocations: { where: { reversalOfId: null, reversedBy: null }, include: { invoice: { select: { number: true } } }, orderBy: { appliedAt: 'asc' } } },
    }));
    return rows.map((x) => ({
      id: x.id, code: x.code, method: x.method, currency: x.currency, amountMinor: x.amountMinor.toString(), receivedAt: x.receivedAt.toISOString(), externalRef: x.externalRef,
      unallocatedMinor: (x.amountMinor - x.allocatedMinor - x.refundedMinor).toString(),
      allocations: x.allocations.map((a) => ({ invoiceId: a.invoiceId, invoiceNumber: a.invoice.number, amountMinor: a.amountInvoiceMinor.toString(), currency: a.invoiceCurrency })),
    }));
  }

  /** Akt-sverka: clientId sessiyadan (foydalanuvchi kiritmaydi). */
  statement(p: PortalContext, q: { currency: 'UZS' | 'USD'; from?: string; to?: string }) {
    const to = q.to ?? todayLocal();
    const from = q.from ?? addMonths(monthStart(to), -11);
    if (from > to) throw badRequest("Boshlanish sanasi tugash sanasidan keyin bo'lmasin");
    return this.finance.statement({ clientId: p.clientId, currency: q.currency, from, to });
  }

  async statementPdf(p: PortalContext, q: { currency: 'UZS' | 'USD'; from?: string; to?: string }) {
    const pdf = await this.statementPdfSvc.render(await this.statement(p, q));
    await this.audit.record(this.db, { action: 'portal.statement_pdf', resourceType: 'client', resourceId: p.clientId, metadata: { currency: q.currency, from: q.from, to: q.to } });
    return pdf;
  }

  // ── Obunalar (narxlar TECHNICIAN uchun yashiriladi) ──
  private subDto(s: SubRow, money: boolean): PortalSubscription {
    return {
      id: s.id, code: s.code, projectName: s.clientProject.project.name, status: s.status, currency: s.currency,
      mrrMinor: money ? monthlyOf(itemsOf(s)).toString() : null,
      nextBillingOn: fromDbDate(s.nextBillingOn), currentPeriodStart: fromDbDate(s.currentPeriodStart), currentPeriodEnd: fromDbDate(s.currentPeriodEnd),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd, trialEndsOn: fromDbDate(s.trialEndsOn),
      pendingChangeOn: (s.pendingChange as PendingChange | null)?.effectiveOn ?? null, paymentTermsDays: s.paymentTermsDays,
      items: (s.revisions[0]?.items ?? []).map((i) => ({
        planName: i.planPrice.plan.name, quantity: i.quantity, unitAmountMinor: money ? i.unitAmountMinor.toString() : null, discountBp: i.discountBp,
        intervalMonths: i.planPrice.plan.intervalMonths,
      })),
    };
  }

  async subscriptions(p: PortalContext): Promise<PortalSubscription[]> {
    const money = accessOf(p.role).finance;
    const subs = await this.portalDb.forClient(p.clientId, (tx) => tx.subscription.findMany({
      where: { status: { notIn: ['EXPIRED'] } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], include: subInclude,
    }));
    return subs.map((s) => this.subDto(s, money));
  }

  async subscriptionDetail(p: PortalContext, subscriptionId: string): Promise<PortalSubscriptionDetail> {
    const access = accessOf(p.role);
    const today = todayLocal();
    const { s, revs, invoices } = await this.portalDb.forClient(p.clientId, async (tx) => {
      const s = await tx.subscription.findFirst({ where: { id: subscriptionId }, include: subInclude });
      if (!s) throw notFound('Obuna');
      const [revs, invoices] = await Promise.all([
        tx.subscriptionRevision.findMany({ where: { subscriptionId }, orderBy: { revisionNo: 'asc' }, include: revItems }),
        access.finance ? tx.invoice.findMany({ where: { subscriptionId, status: { not: 'DRAFT' } }, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }] }) : Promise.resolve(null),
      ]);
      return { s, revs, invoices };
    });
    const pc = s.pendingChange as PendingChange | null;
    const pending = pc ? await this.pendingItems(p.clientId, pc) : null;
    const installs = await this.db.deviceInstallation.findMany({
      where: { status: { not: 'UNINSTALLED' }, component: { projectId: s.clientProject.project.id }, device: { clientId: p.clientId, status: { in: ['ACTIVE', 'DISABLED'] } } },
      include: { device: { include: { site: { select: { name: true } } } }, component: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' },
    });
    const latest = await this.latestVersions(installs.map((i) => i.component.id));
    const money = access.finance;
    return {
      ...this.subDto(s, money),
      startedOn: revs[0] ? localDate(revs[0].validFrom) : null,
      pendingChange: pc && pending ? {
        effectiveOn: pc.effectiveOn, changeType: pc.changeType, mrrMinor: money ? monthlyOf(pending).toString() : null,
        items: pending.map((i) => ({ planName: i.planName, quantity: i.quantity, unitAmountMinor: money ? i.unitAmountMinor.toString() : null, discountBp: i.discountBp })),
      } : null,
      history: revs.map((r) => ({
        date: localDate(r.validFrom), changeType: r.changeType, status: r.status,
        mrrMinor: money ? monthlyOf(r.items.map((i) => ({ quantity: i.quantity, unitAmountMinor: i.unitAmountMinor, discountBp: i.discountBp, intervalMonths: i.planPrice.plan.intervalMonths }))).toString() : null,
      })).reverse(),
      invoices: invoices ? invoices.map((i) => this.invoice(i, today)) : null,
      installations: installs.map((i) => {
        const lv = latest.get(i.component.id) ?? null;
        return {
          deviceId: i.device.id, deviceCode: i.device.code, deviceName: i.device.name, siteName: i.device.site?.name ?? null, componentName: i.component.name,
          currentVersion: i.currentVersion, latestVersion: lv, updateAvailable: newer(lv, i.currentVersion),
        };
      }),
    };
  }

  // ── Qurilmalar ──
  /** Har komponent uchun eng yangi barqaror (stable kanaldagi, prerelease emas, bekor qilinmagan) versiya. */
  private async latestVersions(componentIds: string[]) {
    const map = new Map<string, string>();
    if (!componentIds.length) return map;
    const rels = await this.db.release.findMany({
      where: {
        componentId: { in: [...new Set(componentIds)] }, status: { in: ['READY', 'PUBLISHED'] }, prerelease: null, revokedAt: null,
        channelEntries: { some: { channel: { key: 'stable' } } },
      },
      select: { componentId: true, version: true }, orderBy: [{ major: 'desc' }, { minor: 'desc' }, { patch: 'desc' }],
    });
    for (const r of rels) if (!map.has(r.componentId)) map.set(r.componentId, r.version);
    return map;
  }

  /** components/deployment jadvallari portal roliga ochilmagan — shuning uchun app_rw orqali, clientId FAQAT sessiyadan. */
  private async deviceRows(clientId: string): Promise<PortalDevice[]> {
    const rows = await this.db.device.findMany({
      where: { clientId, status: { in: ['ACTIVE', 'DISABLED'] } }, orderBy: [{ siteId: 'asc' }, { createdAt: 'asc' }],
      include: { site: { select: { name: true } }, installations: { where: { status: { not: 'UNINSTALLED' } }, include: { component: { include: { project: { select: { name: true } } } } } } },
    });
    const instIds = rows.flatMap((d) => d.installations.map((i) => i.id));
    const [latest, updated] = await Promise.all([
      this.latestVersions(rows.flatMap((d) => d.installations.map((i) => i.componentId))),
      instIds.length
        ? this.db.deploymentTarget.groupBy({ by: ['installationId'], where: { installationId: { in: instIds }, status: 'SUCCEEDED' }, _max: { finishedAt: true } })
        : Promise.resolve([]),
    ]);
    const lastUpdate = new Map(updated.map((u) => [u.installationId, u._max.finishedAt]));
    return rows.map((d) => ({
      id: d.id, code: d.code, name: d.name, deviceClass: d.deviceClass, platform: d.platform, status: d.status, siteName: d.site?.name ?? null,
      installations: d.installations.map((i) => {
        const lv = latest.get(i.componentId) ?? null;
        return {
          componentName: i.component.name, projectName: i.component.project.name, currentVersion: i.currentVersion, status: i.status,
          latestVersion: lv, updateAvailable: newer(lv, i.currentVersion), lastUpdatedAt: lastUpdate.get(i.id)?.toISOString() ?? null,
        };
      }),
    }));
  }

  devices(p: PortalContext) { return this.deviceRows(p.clientId); }

  // ── Jamoa (faqat OWNER) ──
  async team(p: PortalContext): Promise<PortalTeamMember[]> {
    const rows = await this.db.portalUser.findMany({ where: { clientId: p.clientId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((u) => ({ ...this.users.dto(u), isMe: u.id === p.portalUserId }));
  }

  teamInvite(p: PortalContext, input: PortalTeamInviteInput) { return this.users.create(p.clientId, input, null, 'owner'); }
  teamReinvite(p: PortalContext, id: string) { return this.users.reinvite(id, null, p.clientId); }

  async teamDeactivate(p: PortalContext, id: string) {
    if (id === p.portalUserId) throw badRequest("O'zingizni o'chira olmaysiz");
    const u = await this.db.portalUser.findFirst({ where: { id, clientId: p.clientId } });
    if (!u) throw notFound('Foydalanuvchi');
    if (u.portalRole === 'OWNER' && u.status === 'ACTIVE'
      && (await this.db.portalUser.count({ where: { clientId: p.clientId, portalRole: 'OWNER', status: 'ACTIVE' } })) <= 1) {
      throw badRequest("Oxirgi egani o'chirib bo'lmaydi");
    }
    return this.users.setStatus(id, 'DEACTIVATED', p.clientId);
  }

  // ── Murojaatlar (o'qish RLS orqali; ichki izohlar DB darajasida ko'rinmaydi) ──
  private reqItem(r: { id: string; code: string; category: string; subject: string; status: string; lastMessageAt: Date; lastMessageBy: 'CLIENT' | 'STAFF'; clientSeenAt: Date | null; createdAt: Date; createdByPortalUser: { fullName: string } | null }): PortalRequestItem {
    return {
      id: r.id, code: r.code, category: r.category, subject: r.subject, status: r.status, lastMessageAt: r.lastMessageAt.toISOString(), lastMessageBy: r.lastMessageBy,
      unread: r.lastMessageBy === 'STAFF' && r.status !== 'CLOSED' && (!r.clientSeenAt || r.clientSeenAt < r.lastMessageAt),
      createdAt: r.createdAt.toISOString(), createdBy: r.createdByPortalUser?.fullName ?? 'ADS jamoasi',
    };
  }

  async requests(p: PortalContext): Promise<PortalRequestItem[]> {
    const rows = await this.portalDb.forClient(p.clientId, (tx) => tx.clientRequest.findMany({
      orderBy: [{ lastMessageAt: 'desc' }], take: 300, include: { createdByPortalUser: { select: { fullName: true } } },
    }));
    return rows.map((r) => this.reqItem(r));
  }

  async requestDetail(p: PortalContext, id: string): Promise<PortalRequestDetail> {
    const r = await this.portalDb.forClient(p.clientId, async (tx) => {
      const r = await tx.clientRequest.findFirst({
        where: { id },
        include: {
          createdByPortalUser: { select: { fullName: true } }, messages: { where: { isInternal: false }, orderBy: { createdAt: 'asc' } },
          subscription: { select: { id: true, code: true, clientProject: { select: { project: { select: { name: true } } } } } },
          device: { select: { id: true, code: true, name: true } },
        },
      });
      if (!r) throw notFound('Murojaat');
      return r;
    });
    await this.requestsSvc.markClientSeen(r.id, p.clientId);
    return {
      ...this.reqItem({ ...r, clientSeenAt: new Date() }), closedAt: r.closedAt?.toISOString() ?? null,
      subscription: r.subscription ? { id: r.subscription.id, code: r.subscription.code, projectName: r.subscription.clientProject.project.name } : null,
      device: r.device, messages: r.messages.map(messageDto),
    };
  }

  createRequest(p: PortalContext, input: RequestCreateInput) { return this.requestsSvc.createFromPortal({ portalUserId: p.portalUserId, clientId: p.clientId, fullName: p.fullName }, input); }
  replyRequest(p: PortalContext, id: string, body: string) { return this.requestsSvc.replyFromPortal({ portalUserId: p.portalUserId, clientId: p.clientId, fullName: p.fullName }, id, body); }
  closeRequest(p: PortalContext, id: string) { return this.requestsSvc.closeFromPortal({ portalUserId: p.portalUserId, clientId: p.clientId, fullName: p.fullName }, id); }
}
