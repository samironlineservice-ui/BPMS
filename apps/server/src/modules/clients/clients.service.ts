import { Injectable } from '@nestjs/common';
import type { ClientDetail, ClientListItem, ClientUpdateInput, ClientUpsertInput, ContactUpsertInput, NoteItem, Paginated, SiteUpsertInput } from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { AuditService, diff } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { blindIndex, decrypt, encrypt, luhnNumber } from '../../platform/crypto.js';
import { Db, type DbOrTx, type DbTx } from '../../platform/db.service.js';
import { badRequest, conflict, notFound, staleVersion } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { SequenceService } from '../../platform/sequence.service.js';

const listInclude = {
  accountManager: { select: { id: true, fullName: true } },
  tags: { include: { tag: true } },
  _count: { select: { projects: true } },
} satisfies Prisma.ClientInclude;
type ClientRow = Prisma.ClientGetPayload<{ include: typeof listInclude }>;

const toItem = (c: ClientRow): ClientListItem => ({
  id: c.id, code: c.code, type: c.type, displayName: c.displayName, legalName: c.legalName, tin: c.tin, status: c.status,
  accountNo: c.accountNo, phone: c.phone, accountManager: c.accountManager, tags: c.tags.map((t) => t.tag.name).sort(),
  projectCount: c._count.projects, createdAt: c.createdAt.toISOString(),
});
const mask = (v: string) => `${'*'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;

export interface ClientListQuery { page: number; pageSize: number; q?: string; status?: string; tag?: string; managerId?: string }

@Injectable()
export class ClientsService {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly seq: SequenceService, private readonly outbox: OutboxService) {}

  async list(q: ClientListQuery): Promise<Paginated<ClientListItem>> {
    const term = q.q?.trim();
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status as never } : { status: { not: 'ARCHIVED' } }),
      ...(q.managerId ? { accountManagerId: q.managerId } : {}),
      ...(q.tag ? { tags: { some: { tag: { name: q.tag, scope: 'CLIENT' } } } } : {}),
      ...(term ? {
        OR: [
          { displayName: { contains: term, mode: 'insensitive' } }, { legalName: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } }, { tin: { startsWith: term } }, { accountNo: { startsWith: term } },
          { phone: { contains: term } }, ...(/^\d{14}$/.test(term) ? [{ pinflHash: blindIndex(term) }] : []),
        ],
      } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.db.client.count({ where }),
    ]);
    return paged(rows.map(toItem), total, q);
  }

  async get(id: string, auth: AuthContext): Promise<ClientDetail> {
    const c = await this.db.client.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...listInclude,
        contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        sites: { where: { deletedAt: null }, include: { _count: { select: { devices: true } } }, orderBy: { createdAt: 'asc' } },
        projects: { include: { project: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!c) throw notFound('Mijoz');
    const sensitive = auth.permissions.has('clients:read_sensitive');
    const pinfl = c.pinflEnc ? decrypt(c.pinflEnc) : null;
    return {
      ...toItem(c),
      pinfl: pinfl ? (sensitive ? pinfl : mask(pinfl)) : null,
      vatPayer: c.vatPayer, legalAddress: c.legalAddress, region: c.region, bankName: c.bankName,
      bankMfo: c.bankMfo, bankAccount: c.bankAccount ? (sensitive ? c.bankAccount : mask(c.bankAccount)) : null,
      billingEmail: c.billingEmail, preferredLocale: c.preferredLocale, billingCurrency: c.billingCurrency, isResident: c.isResident,
      rowVersion: c.rowVersion, updatedAt: c.updatedAt.toISOString(),
      contacts: c.contacts.map((x) => ({ id: x.id, fullName: x.fullName, position: x.position, phone: x.phone, email: x.email, telegram: x.telegram, isPrimary: x.isPrimary, isBilling: x.isBilling })),
      sites: c.sites.map((s) => ({ id: s.id, name: s.name, address: s.address, region: s.region, timezone: s.timezone, deviceCount: s._count.devices })),
      projects: c.projects.map((p) => ({ id: p.id, projectId: p.projectId, code: p.project.code, name: p.project.name, status: p.status })),
    };
  }

  private async setTags(tx: DbOrTx, clientId: string, names: string[]) {
    await tx.clientTag.deleteMany({ where: { clientId } });
    for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
      const tag = await tx.tag.upsert({ where: { scope_name: { scope: 'CLIENT', name } }, create: { scope: 'CLIENT', name }, update: {} });
      await tx.clientTag.create({ data: { clientId, tagId: tag.id } });
    }
  }

  private sensitiveData(input: Partial<ClientUpsertInput>) {
    if (input.pinfl === undefined) return {};
    return input.pinfl ? { pinflEnc: encrypt(input.pinfl), pinflHash: blindIndex(input.pinfl) } : { pinflEnc: null, pinflHash: null };
  }

  async create(input: ClientUpsertInput) {
    return this.db.$transaction((tx) => this.createIn(tx, input));
  }

  /** Tashqi tranzaksiya ichida (masalan, kabinetda ro'yxatdan o'tish: mijoz + kontakt + foydalanuvchi atomik). */
  async createIn(tx: DbTx, input: ClientUpsertInput) {
    const code = await this.seq.code(tx, 'CL');
    let accountNo = luhnNumber(8);
    for (let i = 0; i < 5 && (await tx.client.findUnique({ where: { accountNo } })); i++) accountNo = luhnNumber(8);
    const { tags, pinfl: _p, ...rest } = input;
    const c = await tx.client.create({ data: { ...rest, code, accountNo, ...this.sensitiveData(input) } });
    await this.setTags(tx, c.id, tags);
    await this.audit.record(tx, { action: 'client.created', resourceType: 'client', resourceId: c.id, changes: { before: null, after: { ...rest, code, tags } } });
    await this.outbox.add(tx, { type: 'client.created', eventKey: `client.created:${c.id}`, aggregateType: 'client', aggregateId: c.id, payload: { code, name: c.displayName } });
    return { id: c.id, code };
  }

  async update(id: string, input: ClientUpdateInput) {
    const before = await this.db.client.findFirst({ where: { id, deletedAt: null }, include: { tags: { include: { tag: true } } } });
    if (!before) throw notFound('Mijoz');
    const { rowVersion, tags, pinfl: _p, ...rest } = input;
    return this.db.$transaction(async (tx) => {
      const r = await tx.client.updateMany({ where: { id, rowVersion }, data: { ...rest, ...this.sensitiveData(input), rowVersion: { increment: 1 } } });
      if (r.count === 0) throw staleVersion();
      if (tags) await this.setTags(tx, id, tags);
      const after = await tx.client.findUniqueOrThrow({ where: { id } });
      const { pinflEnc: _a, pinflHash: _b, ...b } = before;
      const { pinflEnc: _c, pinflHash: _d, ...a } = after;
      await this.audit.record(tx, {
        action: 'client.updated', resourceType: 'client', resourceId: id,
        changes: diff({ ...b, tags: before.tags.map((t) => t.tag.name).sort(), pinfl: before.pinflHash ? '[set]' : null }, { ...a, tags: (tags ?? before.tags.map((t) => t.tag.name)).slice().sort(), pinfl: after.pinflHash ? (after.pinflHash === before.pinflHash ? '[set]' : '[changed]') : null }),
      });
      return { ok: true };
    });
  }

  async archive(id: string) {
    const c = await this.db.client.findFirst({ where: { id, deletedAt: null } });
    if (!c) throw notFound('Mijoz');
    const live = await this.db.subscription.count({ where: { clientId: id, status: { notIn: ['CANCELLED', 'EXPIRED'] } } });
    if (live) throw conflict('Mijozda faol obunalar bor — avval ularni bekor qiling');
    await this.db.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date(), rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'client.archived', resourceType: 'client', resourceId: id });
    });
    return { ok: true };
  }

  // ── Kontaktlar ──
  async addContact(clientId: string, input: ContactUpsertInput) {
    await this.ensure(clientId);
    return this.db.$transaction(async (tx) => {
      if (input.isPrimary) await tx.clientContact.updateMany({ where: { clientId, isPrimary: true, deletedAt: null }, data: { isPrimary: false } });
      const c = await tx.clientContact.create({ data: { ...input, clientId } });
      await this.audit.record(tx, { action: 'client.contact_added', resourceType: 'client', resourceId: clientId, metadata: { contactId: c.id, name: c.fullName } });
      return { id: c.id };
    });
  }
  async updateContact(clientId: string, contactId: string, input: ContactUpsertInput) {
    const before = await this.db.clientContact.findFirst({ where: { id: contactId, clientId, deletedAt: null } });
    if (!before) throw notFound('Kontakt');
    await this.db.$transaction(async (tx) => {
      if (input.isPrimary && !before.isPrimary) await tx.clientContact.updateMany({ where: { clientId, isPrimary: true, deletedAt: null }, data: { isPrimary: false } });
      const after = await tx.clientContact.update({ where: { id: contactId }, data: input });
      await this.audit.record(tx, { action: 'client.contact_updated', resourceType: 'client', resourceId: clientId, changes: diff(before, after) });
    });
    return { ok: true };
  }
  async removeContact(clientId: string, contactId: string) {
    const c = await this.db.clientContact.findFirst({ where: { id: contactId, clientId, deletedAt: null } });
    if (!c) throw notFound('Kontakt');
    await this.db.$transaction(async (tx) => {
      await tx.clientContact.update({ where: { id: contactId }, data: { deletedAt: new Date(), isPrimary: false } });
      await this.audit.record(tx, { action: 'client.contact_removed', resourceType: 'client', resourceId: clientId, metadata: { contactId, name: c.fullName } });
    });
    return { ok: true };
  }

  // ── Filiallar ──
  async addSite(clientId: string, input: SiteUpsertInput) {
    await this.ensure(clientId);
    return this.db.$transaction(async (tx) => {
      const s = await tx.clientSite.create({ data: { ...input, clientId } });
      await this.audit.record(tx, { action: 'client.site_added', resourceType: 'client', resourceId: clientId, metadata: { siteId: s.id, name: s.name } });
      return { id: s.id };
    });
  }
  async updateSite(clientId: string, siteId: string, input: SiteUpsertInput) {
    const before = await this.db.clientSite.findFirst({ where: { id: siteId, clientId, deletedAt: null } });
    if (!before) throw notFound('Filial');
    await this.db.$transaction(async (tx) => {
      const after = await tx.clientSite.update({ where: { id: siteId }, data: input });
      await this.audit.record(tx, { action: 'client.site_updated', resourceType: 'client', resourceId: clientId, changes: diff(before, after) });
    });
    return { ok: true };
  }
  async removeSite(clientId: string, siteId: string) {
    const s = await this.db.clientSite.findFirst({ where: { id: siteId, clientId, deletedAt: null }, include: { _count: { select: { devices: true } } } });
    if (!s) throw notFound('Filial');
    if (s._count.devices) throw conflict('Filialda qurilmalar bor');
    await this.db.$transaction(async (tx) => {
      await tx.clientSite.update({ where: { id: siteId }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, { action: 'client.site_removed', resourceType: 'client', resourceId: clientId, metadata: { siteId, name: s.name } });
    });
    return { ok: true };
  }

  // ── Eslatmalar ──
  async notes(clientId: string): Promise<NoteItem[]> {
    const rows = await this.db.clientNote.findMany({ where: { clientId }, include: { author: { select: { fullName: true } } }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] });
    return rows.map((n) => ({ id: n.id, body: n.body, pinned: n.pinned, author: n.author.fullName, createdAt: n.createdAt.toISOString() }));
  }
  async addNote(clientId: string, body: string, pinned: boolean, auth: AuthContext) {
    await this.ensure(clientId);
    if (!body.trim()) throw badRequest("Eslatma bo'sh");
    const n = await this.db.clientNote.create({ data: { clientId, body, pinned, authorId: auth.userId } });
    return { id: n.id };
  }
  async pinNote(clientId: string, noteId: string, pinned: boolean) {
    const r = await this.db.clientNote.updateMany({ where: { id: noteId, clientId }, data: { pinned } });
    if (!r.count) throw notFound('Eslatma');
    return { ok: true };
  }

  async tags() {
    const rows = await this.db.tag.findMany({ where: { scope: 'CLIENT' }, orderBy: { name: 'asc' } });
    return rows.map((t) => t.name);
  }

  private async ensure(id: string) {
    const c = await this.db.client.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!c) throw notFound('Mijoz');
  }
}
