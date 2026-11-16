import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { DeploymentCreateInput, DeploymentDetail, DeploymentListItem, Paginated, TargetEventDto, TargetUpdateInput } from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db, type DbTx } from '../../platform/db.service.js';
import { badRequest, conflict, notFound } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { SequenceService } from '../../platform/sequence.service.js';
import { todayLocal, yearOf } from '../../platform/time.js';
import { ApprovalsService } from '../approvals/approvals.service.js';

const ACTIVE_TARGET = ['PENDING', 'WAITING_WINDOW', 'DOWNLOADING', 'DOWNLOADED', 'INSTALLING', 'VERIFYING'];
const OPEN_TARGET = [...ACTIVE_TARGET, 'BLOCKED_ENTITLEMENT'];

const listInclude = {
  project: { select: { name: true } },
  component: { select: { name: true } },
  release: { select: { version: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.DeploymentInclude;
type DepRow = Prisma.DeploymentGetPayload<{ include: typeof listInclude }>;

/**
 * Deploymentlar (qo'lda yuritiladigan bosqich): reja → rahbar tasdig'i (deployments.production) → bajarilmoqda →
 * har qurilma natijasi qo'lda belgilanadi; muvaffaqiyatli bo'lsa o'rnatma versiyasi yangilanadi. Agent (P9) shu oqimni avtomatlashtiradi.
 */
@Injectable()
export class DeploymentsService implements OnModuleInit {
  constructor(
    private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly seq: SequenceService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    this.approvals.register('deployments.production', {
      describe: async (p) => {
        const d = await this.db.deployment.findUnique({ where: { id: String(p.deploymentId) }, include: { ...listInclude, _count: { select: { targets: true } } } });
        return { title: `Deployment ${d?.code ?? ''}`, description: d ? `${d.project.name} · ${d.component.name} ${d.release.version} · ${d._count.targets} ta qurilma` : '' };
      },
      execute: async (tx, r) => this.executeApproved(tx, String((r.payload as { deploymentId: string }).deploymentId), r.id),
      onReject: async (tx, r) => {
        await tx.deployment.updateMany({ where: { id: String((r.payload as { deploymentId: string }).deploymentId), status: 'PENDING_APPROVAL' }, data: { status: 'DRAFT', rowVersion: { increment: 1 } } });
      },
    });
  }

  private async counts(ids: string[]) {
    if (!ids.length) return new Map<string, { total: number; succeeded: number; failed: number; pending: number }>();
    const rows = await this.db.deploymentTarget.groupBy({ by: ['deploymentId', 'status'], where: { deploymentId: { in: ids } }, _count: { _all: true } });
    const m = new Map<string, { total: number; succeeded: number; failed: number; pending: number }>();
    for (const r of rows) {
      const c = m.get(r.deploymentId) ?? { total: 0, succeeded: 0, failed: 0, pending: 0 };
      c.total += r._count._all;
      if (r.status === 'SUCCEEDED') c.succeeded += r._count._all;
      else if (r.status === 'FAILED' || r.status === 'ROLLED_BACK') c.failed += r._count._all;
      else if (OPEN_TARGET.includes(r.status)) c.pending += r._count._all;
      m.set(r.deploymentId, c);
    }
    return m;
  }

  private toItem(d: DepRow, c?: { total: number; succeeded: number; failed: number; pending: number }): DeploymentListItem {
    return {
      id: d.id, code: d.code, projectName: d.project.name, componentName: d.component.name, version: d.release.version, status: d.status, strategy: d.strategy,
      total: c?.total ?? 0, succeeded: c?.succeeded ?? 0, failed: c?.failed ?? 0, pending: c?.pending ?? 0, createdBy: d.createdBy.fullName, createdAt: d.createdAt.toISOString(),
      scheduledAt: d.scheduledAt?.toISOString() ?? null, startedAt: d.startedAt?.toISOString() ?? null, completedAt: d.completedAt?.toISOString() ?? null,
    };
  }

  async list(q: { page: number; pageSize: number; q?: string; status?: string; projectId?: string; releaseId?: string }): Promise<Paginated<DeploymentListItem>> {
    const term = q.q?.trim();
    const where: Prisma.DeploymentWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.releaseId ? { releaseId: q.releaseId } : {}),
      ...(term ? { OR: [{ code: { contains: term, mode: 'insensitive' } }, { component: { name: { contains: term, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.deployment.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.db.deployment.count({ where }),
    ]);
    const c = await this.counts(rows.map((r) => r.id));
    return paged(rows.map((r) => this.toItem(r, c.get(r.id))), total, q);
  }

  async get(id: string): Promise<DeploymentDetail> {
    const d = await this.db.deployment.findUnique({ where: { id }, include: listInclude });
    if (!d) throw notFound('Deployment');
    const [targets, c, approvals] = await Promise.all([
      this.db.deploymentTarget.findMany({
        where: { deploymentId: id }, orderBy: [{ createdAt: 'asc' }],
        include: { device: { select: { code: true, name: true, client: { select: { displayName: true } } } }, installation: { select: { instanceName: true, clientProject: { select: { client: { select: { displayName: true } } } } } } },
      }),
      this.counts([id]),
      this.approvals.forResource(this.db, id),
    ]);
    const sel = (d.targetSelector ?? {}) as { notes?: string };
    return {
      ...this.toItem(d, c.get(id)), projectId: d.projectId, componentId: d.componentId, releaseId: d.releaseId, respectMaintenance: d.respectMaintenance,
      notes: sel.notes ?? null, approvalRequestId: d.approvalRequestId, rowVersion: d.rowVersion, approvals,
      targets: targets.map((t) => ({
        id: t.id, deviceId: t.deviceId, deviceCode: t.device.code, deviceName: t.device.name,
        clientName: t.installation?.clientProject?.client.displayName ?? t.device.client?.displayName ?? null, installationId: t.installationId,
        instanceName: t.installation?.instanceName ?? null, fromVersion: t.fromVersion, status: t.status, attempt: t.attempt, lastError: t.lastError,
        startedAt: t.startedAt?.toISOString() ?? null, finishedAt: t.finishedAt?.toISOString() ?? null, updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }

  async create(input: DeploymentCreateInput, auth: AuthContext) {
    const rel = await this.db.release.findUnique({ where: { id: input.releaseId }, include: { component: true } });
    if (!rel) throw notFound('Versiya');
    if (!['READY', 'PUBLISHED'].includes(rel.status)) throw conflict("Faqat tayyor (yoki chiqarilgan) versiya o'rnatiladi");
    const ids = [...new Set(input.installationIds)];
    const insts = await this.db.deviceInstallation.findMany({
      where: { id: { in: ids }, componentId: rel.componentId, status: { not: 'UNINSTALLED' }, device: { status: 'ACTIVE' } }, include: { device: { select: { code: true } } },
    });
    if (insts.length !== ids.length) throw badRequest("Tanlangan o'rnatmalarning ba'zilari bu komponentga tegishli emas yoki qurilma faol emas");
    const busy = await this.db.deploymentTarget.findMany({ where: { installationId: { in: ids }, status: { in: ACTIVE_TARGET as never } }, include: { deployment: { select: { code: true } } } });
    if (busy.length) throw conflict(`Ba'zi qurilmalar boshqa faol deploymentda: ${[...new Set(busy.map((b) => b.deployment.code))].join(', ')}`);
    if (input.scheduledAt && new Date(input.scheduledAt) < new Date(Date.now() - 60_000)) throw badRequest("Reja vaqti o'tib ketgan");
    return this.db.$transaction(async (tx) => {
      const code = await this.seq.code(tx, 'DEP', { year: yearOf(todayLocal()), width: 4 });
      const d = await tx.deployment.create({
        data: {
          code, projectId: rel.projectId, componentId: rel.componentId, releaseId: rel.id, strategy: input.strategy,
          targetSelector: { installationIds: ids, notes: input.notes }, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          respectMaintenance: input.respectMaintenance, createdById: auth.userId,
        },
      });
      const wave = await tx.deploymentWave.create({ data: { deploymentId: d.id, index: 0, percent: 100, soakMinutes: 0 } });
      await tx.deploymentTarget.createMany({
        data: insts.map((i) => ({
          deploymentId: d.id, waveId: wave.id, deviceId: i.deviceId, componentId: rel.componentId, installationId: i.id, fromVersion: i.currentVersion, toReleaseId: rel.id,
        })),
      });
      await this.audit.record(tx, { action: 'deployment.created', resourceType: 'deployment', resourceId: d.id, metadata: { code, version: rel.version, targets: insts.length } });
      return { id: d.id, code };
    });
  }

  private async lock(tx: DbTx, id: string) {
    await tx.$queryRaw`SELECT id FROM deployments WHERE id = ${id}::uuid FOR UPDATE`;
    const d = await tx.deployment.findUnique({ where: { id }, include: { release: true } });
    if (!d) throw notFound('Deployment');
    return d;
  }

  /** Rahbar tasdig'iga yuborish. So'rovchida tasdiqlash ruxsati bo'lsa — darhol boshlanadi. */
  async submit(id: string, auth: AuthContext) {
    return this.db.$transaction(async (tx) => {
      const d = await this.lock(tx, id);
      if (d.status !== 'DRAFT') throw conflict('Faqat qoralama deployment tasdiqqa yuboriladi');
      await tx.deployment.update({ where: { id }, data: { status: 'PENDING_APPROVAL', rowVersion: { increment: 1 } } });
      const targets = await tx.deploymentTarget.count({ where: { deploymentId: id } });
      const r = await this.approvals.request(tx, {
        policyKey: 'deployments.production', resourceType: 'deployment', resourceId: id,
        payload: { deploymentId: id, releaseId: d.releaseId, version: d.release.version, targets }, auth,
      });
      await this.audit.record(tx, { action: 'deployment.submitted', resourceType: 'deployment', resourceId: id, metadata: { approval: r.status } });
      return r;
    });
  }

  private async executeApproved(tx: DbTx, id: string, approvalRequestId: string) {
    const d = await this.lock(tx, id);
    if (d.status !== 'PENDING_APPROVAL') throw conflict('Deployment tasdiq kutayotgan holatda emas');
    const later = d.scheduledAt && d.scheduledAt > new Date();
    await tx.deployment.update({
      where: { id },
      data: { status: later ? 'SCHEDULED' : 'RUNNING', startedAt: later ? null : new Date(), approvalRequestId, rowVersion: { increment: 1 } },
    });
    if (!later) await tx.deploymentWave.updateMany({ where: { deploymentId: id }, data: { status: 'RUNNING', startedAt: new Date() } });
    await this.audit.record(tx, { action: later ? 'deployment.scheduled' : 'deployment.started', resourceType: 'deployment', resourceId: id });
    await this.outbox.add(tx, { type: later ? 'deployment.scheduled' : 'deployment.started', eventKey: `deployment.approved:${id}`, aggregateType: 'deployment', aggregateId: id, payload: { code: d.code } });
  }

  async transition(id: string, action: 'start' | 'pause' | 'resume' | 'cancel', reason?: string) {
    return this.db.$transaction(async (tx) => {
      const d = await this.lock(tx, id);
      const now = new Date();
      if (action === 'start') {
        if (d.status !== 'SCHEDULED') throw conflict('Faqat rejalashtirilgan deployment boshlanadi');
        await tx.deployment.update({ where: { id }, data: { status: 'RUNNING', startedAt: now, rowVersion: { increment: 1 } } });
        await tx.deploymentWave.updateMany({ where: { deploymentId: id }, data: { status: 'RUNNING', startedAt: now } });
      } else if (action === 'pause') {
        if (d.status !== 'RUNNING') throw conflict('Faqat bajarilayotgan deployment to\'xtatiladi');
        await tx.deployment.update({ where: { id }, data: { status: 'PAUSED', rowVersion: { increment: 1 } } });
      } else if (action === 'resume') {
        if (d.status !== 'PAUSED') throw conflict("Deployment to'xtatilmagan");
        await tx.deployment.update({ where: { id }, data: { status: 'RUNNING', rowVersion: { increment: 1 } } });
      } else {
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(d.status)) throw conflict('Deployment allaqachon yakunlangan');
        await tx.deployment.update({ where: { id }, data: { status: 'CANCELLED', completedAt: now, rowVersion: { increment: 1 } } });
        await tx.deploymentTarget.updateMany({ where: { deploymentId: id, status: { in: OPEN_TARGET as never } }, data: { status: 'CANCELLED', finishedAt: now, lastError: reason ?? 'Deployment bekor qilindi' } });
        if (d.status === 'PENDING_APPROVAL') await tx.approvalRequest.updateMany({ where: { resourceId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      }
      await this.audit.record(tx, { action: `deployment.${action}`, resourceType: 'deployment', resourceId: id, reason });
      return { ok: true };
    });
  }

  /** Qo'lda natija: SUCCEEDED bo'lsa qurilmadagi o'rnatma versiyasi yangilanadi. Hammasi yakunlansa — deployment yakunlanadi. */
  async updateTarget(id: string, targetId: string, input: TargetUpdateInput, auth: AuthContext) {
    return this.db.$transaction(async (tx) => {
      const d = await this.lock(tx, id);
      if (!['RUNNING', 'PAUSED'].includes(d.status)) throw conflict('Deployment bajarilayotgan holatda emas');
      const t = await tx.deploymentTarget.findFirst({ where: { id: targetId, deploymentId: id } });
      if (!t) throw notFound('Qurilma (target)');
      if (input.status === 'ROLLED_BACK' ? !['SUCCEEDED', 'FAILED'].includes(t.status) : ['CANCELLED', 'SUCCEEDED', 'SKIPPED', 'ROLLED_BACK'].includes(t.status)) {
        throw conflict('Bu qurilma natijasini bunday o\'zgartirib bo\'lmaydi');
      }
      const now = new Date();
      const terminal = input.status !== 'INSTALLING';
      await tx.deploymentTarget.update({
        where: { id: targetId },
        data: {
          status: input.status, attempt: input.status === 'INSTALLING' ? { increment: 1 } : undefined, startedAt: t.startedAt ?? now,
          finishedAt: terminal ? now : null, lastError: input.status === 'FAILED' ? (input.message ?? 'Xato') : input.status === 'SUCCEEDED' ? null : t.lastError,
        },
      });
      await tx.deploymentTargetEvent.create({ data: { targetId, status: input.status, message: input.message, data: { by: auth.userId, byName: auth.fullName } } });
      if (t.installationId) {
        if (input.status === 'SUCCEEDED') {
          await tx.deviceInstallation.update({
            where: { id: t.installationId },
            data: { currentReleaseId: d.releaseId, currentVersion: d.release.version, status: 'INSTALLED', lastReportedAt: now, lastError: null },
          });
        } else if (input.status === 'FAILED') {
          await tx.deviceInstallation.update({ where: { id: t.installationId }, data: { lastError: input.message ?? 'Deployment xatosi', lastReportedAt: now } });
        } else if (input.status === 'INSTALLING') {
          await tx.deviceInstallation.update({ where: { id: t.installationId }, data: { status: 'UPDATING' } });
        } else if (input.status === 'ROLLED_BACK' && t.status === 'SUCCEEDED') {
          await tx.deviceInstallation.update({ where: { id: t.installationId }, data: { currentReleaseId: null, currentVersion: t.fromVersion, status: 'INSTALLED', lastReportedAt: now } });
        }
      }
      const open = await tx.deploymentTarget.count({ where: { deploymentId: id, status: { in: OPEN_TARGET as never } } });
      if (!open) {
        const ok = await tx.deploymentTarget.count({ where: { deploymentId: id, status: 'SUCCEEDED' } });
        await tx.deployment.update({ where: { id }, data: { status: ok ? 'COMPLETED' : 'FAILED', completedAt: now, rowVersion: { increment: 1 } } });
        await tx.deploymentWave.updateMany({ where: { deploymentId: id }, data: { status: ok ? 'SUCCEEDED' : 'HALTED', completedAt: now } });
        await this.outbox.add(tx, { type: ok ? 'deployment.completed' : 'deployment.failed', eventKey: `deployment.done:${id}:${now.getTime()}`, aggregateType: 'deployment', aggregateId: id, payload: { code: d.code } });
      }
      await this.audit.record(tx, { action: 'deployment.target_updated', resourceType: 'deployment', resourceId: id, metadata: { targetId, status: input.status, message: input.message } });
      return { ok: true };
    });
  }

  async targetEvents(id: string, targetId: string): Promise<TargetEventDto[]> {
    const t = await this.db.deploymentTarget.findFirst({ where: { id: targetId, deploymentId: id } });
    if (!t) throw notFound('Qurilma (target)');
    const rows = await this.db.deploymentTargetEvent.findMany({ where: { targetId }, orderBy: { receivedAt: 'asc' } });
    return rows.map((e) => ({ id: e.id, receivedAt: e.receivedAt.toISOString(), status: e.status, message: e.message, by: ((e.data ?? {}) as { byName?: string }).byName ?? null }));
  }
}
