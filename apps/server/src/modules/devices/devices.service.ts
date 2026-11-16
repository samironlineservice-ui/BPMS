import { Injectable } from '@nestjs/common';
import type {
  DeviceCreateInput, DeviceDetail, DeviceListItem, DeviceUpdateInput, InstallationCreateInput, InstallationDto, InstallationUpdateInput, Paginated,
} from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { AuditService, diff } from '../../platform/audit.service.js';
import { Db, type DbOrTx } from '../../platform/db.service.js';
import { badRequest, conflict, notFound, staleVersion } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { SequenceService } from '../../platform/sequence.service.js';

const listInclude = {
  client: { select: { id: true, code: true, displayName: true } },
  site: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  _count: { select: { installations: { where: { status: { not: 'UNINSTALLED' } } } } },
} satisfies Prisma.DeviceInclude;
type DeviceRow = Prisma.DeviceGetPayload<{ include: typeof listInclude }>;

const instInclude = {
  component: { include: { project: { select: { id: true, name: true } } } },
  clientProject: { include: { client: { select: { displayName: true } } } },
  pinnedRelease: { select: { version: true } },
} satisfies Prisma.DeviceInstallationInclude;
type InstRow = Prisma.DeviceInstallationGetPayload<{ include: typeof instInclude }>;

const toItem = (d: DeviceRow): DeviceListItem => ({
  id: d.id, code: d.code, name: d.name, ownerType: d.ownerType, client: d.client ? { id: d.client.id, code: d.client.code, name: d.client.displayName } : null,
  site: d.site, deviceClass: d.deviceClass, managementMode: d.managementMode, platform: d.platform, arch: d.arch, status: d.status, isOnline: d.isOnline,
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null, hostname: d.hostname, tags: d.tags.map((t) => t.tag.name).sort(), installationCount: d._count.installations,
  createdAt: d.createdAt.toISOString(),
});
export const toInstallation = (i: InstRow): InstallationDto => ({
  id: i.id, deviceId: i.deviceId, componentId: i.componentId, componentKey: i.component.key, componentName: i.component.name, runtime: i.component.runtime,
  projectId: i.projectId, projectName: i.component.project.name, clientProjectId: i.clientProjectId, clientName: i.clientProject?.client.displayName ?? null,
  instanceName: i.instanceName, currentReleaseId: i.currentReleaseId, currentVersion: i.currentVersion, pinnedReleaseId: i.pinnedReleaseId,
  pinnedVersion: i.pinnedRelease?.version ?? null, status: i.status, installPath: i.installPath, lastReportedAt: i.lastReportedAt?.toISOString() ?? null,
  lastError: i.lastError, updatedAt: i.updatedAt.toISOString(),
});

export interface DeviceQuery { page: number; pageSize: number; q?: string; clientId?: string; status?: string; deviceClass?: string; platform?: string; ownerType?: string }

@Injectable()
export class DevicesService {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly seq: SequenceService, private readonly outbox: OutboxService) {}

  async list(q: DeviceQuery): Promise<Paginated<DeviceListItem>> {
    const term = q.q?.trim();
    const where: Prisma.DeviceWhereInput = {
      ...(q.status ? { status: q.status as never } : { status: { notIn: ['DECOMMISSIONED', 'REVOKED'] } }),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.deviceClass ? { deviceClass: q.deviceClass as never } : {}),
      ...(q.platform ? { platform: q.platform as never } : {}),
      ...(q.ownerType ? { ownerType: q.ownerType as never } : {}),
      ...(term ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' } }, { code: { contains: term, mode: 'insensitive' } }, { hostname: { contains: term, mode: 'insensitive' } },
          { client: { displayName: { contains: term, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.device.findMany({ where, include: listInclude, orderBy: [{ createdAt: 'desc' }], ...pageArgs(q) }),
      this.db.device.count({ where }),
    ]);
    return paged(rows.map(toItem), total, q);
  }

  async get(id: string): Promise<DeviceDetail> {
    const d = await this.db.device.findUnique({ where: { id }, include: { ...listInclude, gateway: { select: { id: true, code: true, name: true } } } });
    if (!d) throw notFound('Qurilma');
    const [installations, targets] = await Promise.all([
      this.db.deviceInstallation.findMany({ where: { deviceId: id }, include: instInclude, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] }),
      this.db.deploymentTarget.findMany({
        where: { deviceId: id }, orderBy: { updatedAt: 'desc' }, take: 20,
        include: { deployment: { select: { code: true, component: { select: { name: true } } } }, toRelease: { select: { version: true } } },
      }),
    ]);
    const hw = (d.hardware ?? {}) as { notes?: string };
    return {
      ...toItem(d), gateway: d.gateway, osName: d.osName, osVersion: d.osVersion, agentVersion: d.agentVersion, timezone: d.timezone, autoUpdate: d.autoUpdate,
      notes: hw.notes ?? null, revokedAt: d.revokedAt?.toISOString() ?? null, revokeReason: d.revokeReason, rowVersion: d.rowVersion, updatedAt: d.updatedAt.toISOString(),
      installations: installations.map(toInstallation),
      recentTargets: targets.map((t) => ({
        id: t.id, deploymentId: t.deploymentId, deploymentCode: t.deployment.code, componentName: t.deployment.component.name, toVersion: t.toRelease.version,
        status: t.status, updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }

  /** DB CHECK'lari bilan bir xil qoidalar — foydalanuvchiga tushunarli xabar uchun oldindan tekshiriladi. */
  private validateShape(d: {
    ownerType: string; clientId?: string | null; siteId?: string | null; deviceClass: string; platform: string; managementMode: string; gatewayDeviceId?: string | null;
  }) {
    if ((d.ownerType === 'CLIENT') !== !!d.clientId) throw badRequest(d.ownerType === 'CLIENT' ? 'Mijozni tanlang' : "Kompaniya qurilmasi mijozga bog'lanmaydi");
    if (d.ownerType !== 'CLIENT' && d.siteId) throw badRequest("Kompaniya qurilmasida filial bo'lmaydi");
    if ((d.deviceClass === 'MICROCONTROLLER') !== (d.platform === 'ESP_IDF')) throw badRequest('Mikrokontroller (ESP32) faqat ESP-IDF platformasida');
    if ((d.platform === 'ESP_IDF') === (d.managementMode === 'AGENT')) {
      throw badRequest(d.platform === 'ESP_IDF' ? "ESP32 agent bilan boshqarilmaydi — firmware OTA yoki gateway orqali" : 'Bu qurilma agent orqali boshqariladi');
    }
    if ((d.managementMode === 'GATEWAY_PROXIED') !== !!d.gatewayDeviceId) throw badRequest('Gateway rejimida gateway-qurilmani tanlang');
  }

  private async setTags(tx: DbOrTx, deviceId: string, names: string[]) {
    await tx.deviceTag.deleteMany({ where: { deviceId } });
    for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
      const tag = await tx.tag.upsert({ where: { scope_name: { scope: 'DEVICE', name } }, create: { scope: 'DEVICE', name }, update: {} });
      await tx.deviceTag.create({ data: { deviceId, tagId: tag.id } });
    }
  }

  async create(input: DeviceCreateInput) {
    this.validateShape(input);
    if (input.clientId && !(await this.db.client.findFirst({ where: { id: input.clientId, deletedAt: null } }))) throw notFound('Mijoz');
    return this.db.$transaction(async (tx) => {
      const code = await this.seq.code(tx, 'DV');
      const { tags, notes, ...rest } = input;
      const d = await tx.device.create({ data: { ...rest, code, status: 'ACTIVE', hardware: notes ? { notes } : undefined } });
      await this.setTags(tx, d.id, tags);
      await this.audit.record(tx, { action: 'device.registered', resourceType: 'device', resourceId: d.id, metadata: { code, name: d.name, clientId: d.clientId } });
      await this.outbox.add(tx, { type: 'device.registered', eventKey: `device.registered:${d.id}`, aggregateType: 'device', aggregateId: d.id, payload: { code, clientId: d.clientId } });
      return { id: d.id, code };
    });
  }

  async update(id: string, input: DeviceUpdateInput) {
    const before = await this.db.device.findUnique({ where: { id } });
    if (!before) throw notFound('Qurilma');
    const { rowVersion, tags, notes, ...rest } = input;
    this.validateShape({
      ownerType: before.ownerType, clientId: before.clientId, siteId: rest.siteId !== undefined ? rest.siteId : before.siteId,
      deviceClass: rest.deviceClass ?? before.deviceClass, platform: rest.platform ?? before.platform, managementMode: rest.managementMode ?? before.managementMode,
      gatewayDeviceId: rest.gatewayDeviceId !== undefined ? rest.gatewayDeviceId : before.gatewayDeviceId,
    });
    return this.db.$transaction(async (tx) => {
      const hw = { ...((before.hardware ?? {}) as object), ...(notes !== undefined ? { notes } : {}) };
      const r = await tx.device.updateMany({ where: { id, rowVersion }, data: { ...rest, hardware: hw, rowVersion: { increment: 1 } } });
      if (!r.count) throw staleVersion();
      if (tags) await this.setTags(tx, id, tags);
      const after = await tx.device.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, { action: 'device.updated', resourceType: 'device', resourceId: id, changes: diff(before, after) });
      return { ok: true };
    });
  }

  async setStatus(id: string, to: 'ACTIVE' | 'DISABLED' | 'DECOMMISSIONED', reason: string | null, rowVersion: number) {
    const d = await this.db.device.findUnique({ where: { id } });
    if (!d) throw notFound('Qurilma');
    if (d.status === 'DECOMMISSIONED' || d.status === 'REVOKED') throw conflict("Foydalanishdan chiqarilgan qurilmani qayta yoqib bo'lmaydi");
    return this.db.$transaction(async (tx) => {
      const terminal = to === 'DECOMMISSIONED';
      const r = await tx.device.updateMany({
        where: { id, rowVersion },
        data: { status: to, rowVersion: { increment: 1 }, ...(terminal ? { revokedAt: new Date(), revokeReason: reason, isOnline: false } : {}) },
      });
      if (!r.count) throw staleVersion();
      if (terminal) await tx.deviceInstallation.updateMany({ where: { deviceId: id, status: { not: 'UNINSTALLED' } }, data: { status: 'UNINSTALLED' } });
      await this.audit.record(tx, { action: `device.${to.toLowerCase()}`, resourceType: 'device', resourceId: id, reason: reason ?? undefined });
      return { ok: true };
    });
  }

  // ── O'rnatmalar: qurilmada qaysi loyiha komponenti, qaysi mijoz uchun, qaysi versiyada ──
  async addInstallation(deviceId: string, input: InstallationCreateInput) {
    const d = await this.db.device.findUnique({ where: { id: deviceId } });
    if (!d) throw notFound('Qurilma');
    if (d.status === 'DECOMMISSIONED' || d.status === 'REVOKED') throw conflict('Qurilma foydalanishdan chiqarilgan');
    const comp = await this.db.projectComponent.findUnique({ where: { id: input.componentId } });
    if (!comp) throw notFound('Komponent');
    if ((comp.runtime === 'FIRMWARE') !== (d.platform === 'ESP_IDF')) throw badRequest('Firmware komponenti faqat ESP32 qurilmalarga, boshqalari — aksincha');
    let clientId: string | null = null;
    if (input.clientProjectId) {
      const cp = await this.db.clientProject.findUnique({ where: { id: input.clientProjectId } });
      if (!cp || cp.projectId !== comp.projectId) throw badRequest('Mijoz bu loyihaga ulanmagan');
      if (d.ownerType === 'CLIENT' && cp.clientId !== d.clientId) throw badRequest("Mijoz qurilmasida faqat o'sha mijozning instansi bo'ladi");
      clientId = cp.clientId;
    } else if (d.ownerType === 'CLIENT') {
      const cp = await this.db.clientProject.findUnique({ where: { clientId_projectId: { clientId: d.clientId!, projectId: comp.projectId } } });
      if (!cp) throw badRequest("Mijoz bu loyihaga ulanmagan — avval mijoz kartochkasida loyihaga ulang");
      input = { ...input, clientProjectId: cp.id };
      clientId = cp.clientId;
    }
    let currentVersion = input.currentVersion;
    if (input.currentReleaseId) {
      const rel = await this.db.release.findUnique({ where: { id: input.currentReleaseId } });
      if (!rel || rel.componentId !== comp.id) throw badRequest('Versiya bu komponentga tegishli emas');
      currentVersion = rel.version;
    }
    return this.db.$transaction(async (tx) => {
      const existing = await tx.deviceInstallation.findFirst({ where: { deviceId, componentId: comp.id, clientProjectId: input.clientProjectId ?? null } });
      if (existing && existing.status !== 'UNINSTALLED') throw conflict("Bu komponent qurilmada allaqachon o'rnatilgan");
      const data = {
        instanceName: input.instanceName, currentReleaseId: input.currentReleaseId ?? null, currentVersion, installPath: input.installPath,
        status: 'INSTALLED' as const, lastReportedAt: new Date(), lastError: null,
      };
      const inst = existing
        ? await tx.deviceInstallation.update({ where: { id: existing.id }, data })
        : await tx.deviceInstallation.create({
          data: { ...data, deviceId, componentId: comp.id, projectId: comp.projectId, clientId, clientProjectId: input.clientProjectId ?? null },
        });
      await this.audit.record(tx, { action: 'device.installation_added', resourceType: 'device', resourceId: deviceId, metadata: { installationId: inst.id, component: comp.key, version: currentVersion } });
      return { id: inst.id };
    });
  }

  async updateInstallation(deviceId: string, installationId: string, input: InstallationUpdateInput) {
    const before = await this.db.deviceInstallation.findFirst({ where: { id: installationId, deviceId } });
    if (!before) throw notFound("O'rnatma");
    const data: Prisma.DeviceInstallationUncheckedUpdateInput = { ...input };
    for (const key of ['currentReleaseId', 'pinnedReleaseId'] as const) {
      const rid = input[key];
      if (rid) {
        const rel = await this.db.release.findUnique({ where: { id: rid } });
        if (!rel || rel.componentId !== before.componentId) throw badRequest('Versiya bu komponentga tegishli emas');
        if (key === 'currentReleaseId') data.currentVersion = rel.version;
      }
    }
    if (input.currentReleaseId !== undefined || input.currentVersion !== undefined) data.lastReportedAt = new Date();
    await this.db.$transaction(async (tx) => {
      const after = await tx.deviceInstallation.update({ where: { id: installationId }, data });
      await this.audit.record(tx, { action: 'device.installation_updated', resourceType: 'device', resourceId: deviceId, changes: diff(before, after), metadata: { installationId } });
    });
    return { ok: true };
  }

  /** Deployment tanlash uchun: komponentning faol o'rnatmalari (mijoz/qurilma ma'lumoti bilan). */
  async installationsForComponent(componentId: string, clientId?: string): Promise<(InstallationDto & { deviceCode: string; deviceName: string; deviceStatus: string })[]> {
    const rows = await this.db.deviceInstallation.findMany({
      where: { componentId, status: { not: 'UNINSTALLED' }, device: { status: 'ACTIVE' }, ...(clientId ? { clientId } : {}) },
      include: { ...instInclude, device: { select: { code: true, name: true, status: true } } },
      orderBy: [{ clientId: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({ ...toInstallation(r), deviceCode: r.device.code, deviceName: r.device.name, deviceStatus: r.device.status }));
  }

  async tags() {
    const rows = await this.db.tag.findMany({ where: { scope: 'DEVICE' }, orderBy: { name: 'asc' } });
    return rows.map((t) => t.name);
  }
}
