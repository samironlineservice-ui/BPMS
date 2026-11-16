import { Injectable } from '@nestjs/common';
import type {
  ClientProjectCreateInput, ClientProjectItem, ClientProjectUpdateInput, ComponentUpsertInput, Paginated, ProjectCreateInput,
  ProjectDetail, ProjectListItem, ProjectUpdateInput,
} from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { AuditService, diff } from '../../platform/audit.service.js';
import { Db } from '../../platform/db.service.js';
import { badRequest, conflict, notFound, staleVersion } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { pageArgs, paged } from '../../platform/paging.js';

const listInclude = {
  owner: { select: { id: true, fullName: true } },
  _count: { select: { clients: true, components: true, members: true } },
} satisfies Prisma.ProjectInclude;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof listInclude }>;

const toItem = (p: ProjectRow): ProjectListItem => ({
  id: p.id, code: p.code, name: p.name, status: p.status, isInternal: p.isInternal, supportedPlatforms: p.supportedPlatforms,
  owner: p.owner, clientCount: p._count.clients, componentCount: p._count.components, memberCount: p._count.members,
  createdAt: p.createdAt.toISOString(),
});

const cpInclude = {
  client: { select: { code: true, displayName: true } },
  project: { select: { code: true, name: true } },
  accountManager: { select: { id: true, fullName: true } },
  _count: { select: { subscriptions: true } },
} satisfies Prisma.ClientProjectInclude;
type CpRow = Prisma.ClientProjectGetPayload<{ include: typeof cpInclude }>;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
export const toClientProject = (cp: CpRow): ClientProjectItem => ({
  id: cp.id, clientId: cp.clientId, projectId: cp.projectId, clientCode: cp.client.code, clientName: cp.client.displayName,
  projectCode: cp.project.code, projectName: cp.project.name, status: cp.status, startedOn: day(cp.startedOn), endedOn: day(cp.endedOn),
  accountManager: cp.accountManager, notes: cp.notes, rowVersion: cp.rowVersion, subscriptionCount: cp._count.subscriptions,
});
const asDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00Z`));

@Injectable()
export class ProjectsService {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  async list(q: { page: number; pageSize: number; q?: string; status?: string }): Promise<Paginated<ProjectListItem>> {
    const term = q.q?.trim();
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status as never } : { status: { not: 'ARCHIVED' } }),
      ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { code: { contains: term, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.project.findMany({ where, include: listInclude, orderBy: [{ isInternal: 'asc' }, { name: 'asc' }], ...pageArgs(q) }),
      this.db.project.count({ where }),
    ]);
    return paged(rows.map(toItem), total, q);
  }

  async get(id: string): Promise<ProjectDetail> {
    const p = await this.db.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...listInclude,
        components: { include: { _count: { select: { releases: true } } }, orderBy: { createdAt: 'asc' } },
        members: { include: { user: { select: { fullName: true, email: true } } }, orderBy: { addedAt: 'asc' } },
        clients: { include: cpInclude, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!p) throw notFound('Loyiha');
    return {
      ...toItem(p), description: p.description, repositoryUrl: p.repositoryUrl, rowVersion: p.rowVersion, updatedAt: p.updatedAt.toISOString(),
      components: p.components.map((c) => ({
        id: c.id, key: c.key, name: c.name, description: c.description, runtime: c.runtime, supportedPlatforms: c.supportedPlatforms,
        isActive: c.isActive, releaseCount: c._count.releases,
      })),
      members: p.members.map((m) => ({ userId: m.userId, fullName: m.user.fullName, email: m.user.email, role: m.role, addedAt: m.addedAt.toISOString() })),
      clients: p.clients.map(toClientProject),
    };
  }

  async create(input: ProjectCreateInput) {
    if (await this.db.project.findUnique({ where: { code: input.code } })) throw conflict('Bunday kodli loyiha mavjud');
    return this.db.$transaction(async (tx) => {
      const p = await tx.project.create({ data: input });
      await this.audit.record(tx, { action: 'project.created', resourceType: 'project', resourceId: p.id, changes: { before: null, after: input } });
      await this.outbox.add(tx, { type: 'project.created', eventKey: `project.created:${p.id}`, aggregateType: 'project', aggregateId: p.id, payload: { code: p.code, name: p.name } });
      return { id: p.id };
    });
  }

  async update(id: string, input: ProjectUpdateInput) {
    const before = await this.db.project.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound('Loyiha');
    const { rowVersion, ...data } = input;
    return this.db.$transaction(async (tx) => {
      const r = await tx.project.updateMany({ where: { id, rowVersion }, data: { ...data, rowVersion: { increment: 1 } } });
      if (r.count === 0) throw staleVersion();
      const after = await tx.project.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, { action: 'project.updated', resourceType: 'project', resourceId: id, changes: diff(before, after) });
      return { ok: true };
    });
  }

  async archive(id: string) {
    const p = await this.db.project.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound('Loyiha');
    const live = await this.db.subscription.count({ where: { clientProject: { projectId: id }, status: { notIn: ['CANCELLED', 'EXPIRED'] } } });
    if (live) throw conflict('Loyihada faol obunalar bor');
    await this.db.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date(), rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'project.archived', resourceType: 'project', resourceId: id });
    });
    return { ok: true };
  }

  // ── Komponentlar ──
  async addComponent(projectId: string, input: ComponentUpsertInput) {
    await this.ensure(projectId);
    if (await this.db.projectComponent.findUnique({ where: { projectId_key: { projectId, key: input.key } } })) throw conflict('Bunday kalitli komponent mavjud');
    return this.db.$transaction(async (tx) => {
      const c = await tx.projectComponent.create({ data: { ...input, projectId } });
      await this.audit.record(tx, { action: 'project.component_added', resourceType: 'project', resourceId: projectId, metadata: { componentId: c.id, key: c.key } });
      return { id: c.id };
    });
  }

  async updateComponent(projectId: string, componentId: string, input: ComponentUpsertInput) {
    const before = await this.db.projectComponent.findFirst({ where: { id: componentId, projectId }, include: { _count: { select: { releases: true } } } });
    if (!before) throw notFound('Komponent');
    if (before.key !== input.key && before._count.releases) throw badRequest("Versiyalari bor komponent kalitini o'zgartirib bo'lmaydi");
    await this.db.$transaction(async (tx) => {
      const after = await tx.projectComponent.update({ where: { id: componentId }, data: input });
      const { _count, ...b } = before;
      await this.audit.record(tx, { action: 'project.component_updated', resourceType: 'project', resourceId: projectId, changes: diff(b, after) });
    });
    return { ok: true };
  }

  async removeComponent(projectId: string, componentId: string) {
    const c = await this.db.projectComponent.findFirst({
      where: { id: componentId, projectId }, include: { _count: { select: { releases: true, installations: true, deployments: true } } },
    });
    if (!c) throw notFound('Komponent');
    if (c._count.releases || c._count.installations || c._count.deployments) throw conflict("Komponentda versiya/o'rnatma bor — uni faolsizlantiring");
    await this.db.$transaction(async (tx) => {
      await tx.projectComponent.delete({ where: { id: componentId } });
      await this.audit.record(tx, { action: 'project.component_removed', resourceType: 'project', resourceId: projectId, metadata: { key: c.key } });
    });
    return { ok: true };
  }

  // ── Jamoa ──
  async setMember(projectId: string, userId: string, role: 'LEAD' | 'DEVELOPER' | 'QA' | 'SUPPORT') {
    await this.ensure(projectId);
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw badRequest('Faol xodim tanlang');
    await this.db.$transaction(async (tx) => {
      await tx.projectMember.upsert({ where: { projectId_userId: { projectId, userId } }, create: { projectId, userId, role }, update: { role } });
      await this.audit.record(tx, { action: 'project.member_set', resourceType: 'project', resourceId: projectId, metadata: { userId, role } });
    });
    return { ok: true };
  }

  async removeMember(projectId: string, userId: string) {
    const r = await this.db.projectMember.deleteMany({ where: { projectId, userId } });
    if (!r.count) throw notFound("Jamoa a'zosi");
    await this.audit.record(this.db, { action: 'project.member_removed', resourceType: 'project', resourceId: projectId, metadata: { userId } });
    return { ok: true };
  }

  // ── Mijoz ↔ loyiha (M:N) ──
  async listClientProjects(filter: { clientId?: string; projectId?: string }): Promise<ClientProjectItem[]> {
    const rows = await this.db.clientProject.findMany({ where: filter, include: cpInclude, orderBy: { createdAt: 'asc' } });
    return rows.map(toClientProject);
  }

  async link(input: ClientProjectCreateInput) {
    const [client, project] = await Promise.all([
      this.db.client.findFirst({ where: { id: input.clientId, deletedAt: null } }),
      this.ensure(input.projectId),
    ]);
    if (!client) throw notFound('Mijoz');
    if (await this.db.clientProject.findUnique({ where: { clientId_projectId: { clientId: input.clientId, projectId: input.projectId } } }))
      throw conflict('Mijoz bu loyihaga allaqachon ulangan');
    return this.db.$transaction(async (tx) => {
      const cp = await tx.clientProject.create({
        data: { ...input, startedOn: asDate(input.startedOn), endedOn: asDate(input.endedOn) },
      });
      await this.audit.record(tx, { action: 'client_project.linked', resourceType: 'client', resourceId: input.clientId, metadata: { projectId: input.projectId, project: project.code, clientProjectId: cp.id } });
      await this.audit.record(tx, { action: 'client_project.linked', resourceType: 'project', resourceId: input.projectId, metadata: { clientId: input.clientId, client: client.code, clientProjectId: cp.id } });
      await this.outbox.add(tx, { type: 'client_project.linked', eventKey: `client_project.linked:${cp.id}`, aggregateType: 'client_project', aggregateId: cp.id, payload: { clientId: input.clientId, projectId: input.projectId } });
      return { id: cp.id };
    });
  }

  async updateLink(id: string, input: ClientProjectUpdateInput) {
    const before = await this.db.clientProject.findUnique({ where: { id } });
    if (!before) throw notFound("Mijoz–loyiha bog'lanishi");
    const { rowVersion, startedOn, endedOn, ...rest } = input;
    await this.db.$transaction(async (tx) => {
      const r = await tx.clientProject.updateMany({
        where: { id, rowVersion },
        data: { ...rest, startedOn: asDate(startedOn), endedOn: asDate(endedOn), rowVersion: { increment: 1 } },
      });
      if (r.count === 0) throw staleVersion();
      const after = await tx.clientProject.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, { action: 'client_project.updated', resourceType: 'client', resourceId: before.clientId, changes: diff(before, after), metadata: { clientProjectId: id } });
    });
    return { ok: true };
  }

  async unlink(id: string) {
    const cp = await this.db.clientProject.findUnique({ where: { id }, include: { _count: { select: { subscriptions: true, installations: true } } } });
    if (!cp) throw notFound("Mijoz–loyiha bog'lanishi");
    if (cp._count.subscriptions || cp._count.installations) throw conflict("Obuna yoki o'rnatmalar bor — holatini 'Ketgan' qiling");
    await this.db.$transaction(async (tx) => {
      await tx.clientProject.delete({ where: { id } });
      await this.audit.record(tx, { action: 'client_project.unlinked', resourceType: 'client', resourceId: cp.clientId, metadata: { projectId: cp.projectId } });
    });
    return { ok: true };
  }

  private async ensure(id: string) {
    const p = await this.db.project.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound('Loyiha');
    return p;
  }
}
