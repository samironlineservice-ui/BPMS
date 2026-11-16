import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type ArtifactCreateInput, type Paginated, type ReleaseCreateInput, type ReleaseDetail, type ReleaseListItem, semverRegex } from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db, type DbOrTx } from '../../platform/db.service.js';
import { badRequest, conflict, notFound } from '../../platform/errors.js';
import { OutboxService } from '../../platform/outbox.service.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { StorageService } from '../../platform/storage.service.js';

const DEFAULT_CHANNELS = [
  { key: 'stable', name: 'Barqaror (stable)', isDefault: true },
  { key: 'beta', name: 'Beta', isDefault: false },
  { key: 'canary', name: 'Canary (sinov)', isDefault: false },
];
const UNSIGNED = ['DRAFT', 'UPLOADING', 'SCANNING', 'AWAITING_SIGNATURES'];

const listInclude = {
  project: { select: { name: true } },
  component: { select: { key: true, name: true } },
  createdBy: { select: { fullName: true } },
  channelEntries: { include: { channel: { select: { key: true } } } },
  _count: { select: { artifacts: true, installationsCurrent: { where: { status: { not: 'UNINSTALLED' } } } } },
} satisfies Prisma.ReleaseInclude;
type ReleaseRow = Prisma.ReleaseGetPayload<{ include: typeof listInclude }>;

const toItem = (r: ReleaseRow): ReleaseListItem => ({
  id: r.id, projectId: r.projectId, projectName: r.project.name, componentId: r.componentId, componentKey: r.component.key, componentName: r.component.name,
  version: r.version, versionCode: r.versionCode, status: r.status, securityFix: r.securityFix, urgency: r.urgency,
  channels: r.channelEntries.map((e) => e.channel.key), artifactCount: r._count.artifacts, installedCount: r._count.installationsCurrent,
  createdBy: r.createdBy.fullName, createdAt: r.createdAt.toISOString(), publishedAt: r.publishedAt?.toISOString() ?? null,
});

export interface ReleaseQuery { page: number; pageSize: number; q?: string; projectId?: string; componentId?: string; status?: string }

/**
 * Versiyalar reyestri. Qo'lda yuritiladigan bosqichda (agent — P9) "Tayyor" = artefakt hash'lari tekshirilgan,
 * tuf_role_version = 0 (TUF imzosiz). Agent bosqichida TUF threshold imzosi talab qilinadi.
 */
@Injectable()
export class ReleasesService {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly storage: StorageService) {}

  async ensureChannels(tx: DbOrTx, projectId: string) {
    const n = await tx.releaseChannel.count({ where: { projectId } });
    if (!n) await tx.releaseChannel.createMany({ data: DEFAULT_CHANNELS.map((c) => ({ ...c, projectId })), skipDuplicates: true });
  }

  async list(q: ReleaseQuery): Promise<Paginated<ReleaseListItem>> {
    const term = q.q?.trim();
    const where: Prisma.ReleaseWhereInput = {
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.componentId ? { componentId: q.componentId } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(term ? { OR: [{ version: { startsWith: term } }, { component: { name: { contains: term, mode: 'insensitive' } } }, { project: { name: { contains: term, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.release.findMany({ where, include: listInclude, orderBy: [{ createdAt: 'desc' }], ...pageArgs(q) }),
      this.db.release.count({ where }),
    ]);
    return paged(rows.map(toItem), total, q);
  }

  async get(id: string): Promise<ReleaseDetail> {
    const r = await this.db.release.findUnique({
      where: { id },
      include: {
        ...listInclude, publishedBy: { select: { fullName: true } },
        artifacts: { include: { file: { select: { originalName: true } } }, orderBy: { createdAt: 'asc' } },
        deployments: { include: { _count: { select: { targets: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!r) throw notFound('Versiya');
    const channels = await this.db.releaseChannel.findMany({ where: { projectId: r.projectId }, orderBy: [{ isDefault: 'desc' }, { key: 'asc' }] });
    const notes = (r.releaseNotes ?? {}) as { uz?: string };
    return {
      ...toItem(r), notes: notes.uz ?? '', minAgentVersion: r.minAgentVersion, upgradeFrom: r.upgradeFrom, publishedBy: r.publishedBy?.fullName ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null, revokeReason: r.revokeReason, rowVersion: r.rowVersion,
      artifacts: r.artifacts.map((a) => ({
        id: a.id, platform: a.platform, arch: a.arch, kind: a.kind, variant: a.variant, fileId: a.fileId, fileName: a.file.originalName, sha256: a.sha256,
        sizeBytes: a.sizeBytes.toString(), tufTargetPath: a.tufTargetPath, createdAt: a.createdAt.toISOString(),
      })),
      availableChannels: (channels.length ? channels : DEFAULT_CHANNELS).map((c) => ({ key: c.key, name: c.name, isDefault: c.isDefault })),
      deployments: r.deployments.map((d) => ({ id: d.id, code: d.code, status: d.status, targets: d._count.targets, createdAt: d.createdAt.toISOString() })),
    };
  }

  async create(input: ReleaseCreateInput, auth: AuthContext) {
    const comp = await this.db.projectComponent.findUnique({ where: { id: input.componentId }, include: { project: true } });
    if (!comp || comp.project.deletedAt) throw notFound('Komponent');
    const m = semverRegex.exec(input.version)!;
    const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const versionCode = input.versionCode ?? major * 1_000_000 + minor * 1_000 + patch;
    if (await this.db.release.findUnique({ where: { componentId_version: { componentId: comp.id, version: input.version } } })) throw conflict('Bu versiya allaqachon mavjud');
    if (await this.db.release.findUnique({ where: { componentId_versionCode: { componentId: comp.id, versionCode } } })) {
      throw conflict(`versionCode ${versionCode} band — prerelease uchun qo'lda boshqa kod kiriting`);
    }
    return this.db.$transaction(async (tx) => {
      await this.ensureChannels(tx, comp.projectId);
      const r = await tx.release.create({
        data: {
          projectId: comp.projectId, componentId: comp.id, version: input.version, major, minor, patch, prerelease: m[4]?.slice(1) ?? null, versionCode,
          securityFix: input.securityFix, urgency: input.urgency, minAgentVersion: input.minAgentVersion, upgradeFrom: input.upgradeFrom,
          releaseNotes: { uz: input.notes }, createdById: auth.userId,
        },
      });
      await this.audit.record(tx, { action: 'release.created', resourceType: 'release', resourceId: r.id, metadata: { component: comp.key, version: input.version } });
      return { id: r.id };
    });
  }

  private async load(id: string) {
    const r = await this.db.release.findUnique({ where: { id }, include: { component: true, project: true } });
    if (!r) throw notFound('Versiya');
    return r;
  }

  async updateNotes(id: string, notes: string) {
    const r = await this.load(id);
    await this.db.release.update({ where: { id }, data: { releaseNotes: { ...((r.releaseNotes ?? {}) as object), uz: notes }, rowVersion: { increment: 1 } } });
    await this.audit.record(this.db, { action: 'release.notes_updated', resourceType: 'release', resourceId: id });
    return { ok: true };
  }

  private async sha512(key: string) {
    const h = createHash('sha512');
    for await (const chunk of this.storage.read(key)) h.update(chunk as Buffer);
    return h.digest('hex');
  }

  async addArtifact(id: string, input: ArtifactCreateInput) {
    const r = await this.load(id);
    if (!UNSIGNED.includes(r.status)) throw conflict("Tayyor bo'lgan versiyaga fayl qo'shib bo'lmaydi — yangi versiya yarating");
    const f = await this.db.file.findFirst({ where: { id: input.fileId, deletedAt: null, status: 'AVAILABLE' } });
    if (!f || !f.sha256) throw notFound('Fayl');
    if (f.sizeBytes <= 0n) throw badRequest("Bo'sh fayl");
    const slugPart = [input.platform.toLowerCase(), input.arch.toLowerCase(), input.variant].filter(Boolean).join('-');
    const tufTargetPath = `${r.project.code}/${r.component.key}/${r.version}/${slugPart}/${f.originalName.replace(/[^\w.-]+/g, '_')}`;
    const sha512 = await this.sha512(f.storageKey);
    return this.db.$transaction(async (tx) => {
      const a = await tx.releaseArtifact.create({
        data: {
          releaseId: id, platform: input.platform, arch: input.arch, kind: input.kind, variant: input.variant, fileId: f.id, sha256: f.sha256!, sha512,
          sizeBytes: f.sizeBytes, tufTargetPath,
          customMeta: { component: r.component.key, kind: input.kind, version: r.version, versionCode: r.versionCode, platform: { os: input.platform, arch: input.arch }, variant: input.variant, security: r.securityFix, urgency: r.urgency.toLowerCase() },
        },
      });
      await tx.fileAttachment.upsert({
        where: { fileId_entityType_entityId: { fileId: f.id, entityType: 'RELEASE', entityId: id } },
        create: { fileId: f.id, entityType: 'RELEASE', entityId: id, label: `${input.platform}/${input.arch}` }, update: {},
      });
      await this.audit.record(tx, { action: 'release.artifact_added', resourceType: 'release', resourceId: id, metadata: { artifactId: a.id, file: f.originalName, sha256: f.sha256, platform: input.platform, arch: input.arch } });
      return { id: a.id };
    });
  }

  async removeArtifact(id: string, artifactId: string) {
    const r = await this.load(id);
    if (!UNSIGNED.includes(r.status)) throw conflict("Tayyor versiya fayllari o'zgarmaydi");
    const a = await this.db.releaseArtifact.findFirst({ where: { id: artifactId, releaseId: id } });
    if (!a) throw notFound('Artefakt');
    await this.db.$transaction(async (tx) => {
      await tx.releaseArtifact.delete({ where: { id: artifactId } });
      await this.audit.record(tx, { action: 'release.artifact_removed', resourceType: 'release', resourceId: id, metadata: { artifactId, sha256: a.sha256 } });
    });
    return { ok: true };
  }

  /** DRAFT → READY: o'zgarmas bo'ladi (DB trigger). Qo'lda bosqich: tuf_role_version = 0. */
  async markReady(id: string) {
    const r = await this.load(id);
    if (!UNSIGNED.includes(r.status)) throw conflict('Versiya allaqachon tayyor');
    await this.db.$transaction(async (tx) => {
      await tx.release.update({ where: { id }, data: { status: 'READY', tufRole: `project-${r.project.code}`, tufRoleVersion: 0, rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'release.ready', resourceType: 'release', resourceId: id, metadata: { version: r.version } });
    });
    return { ok: true };
  }

  async promote(id: string, channelKey: string, auth: AuthContext) {
    const r = await this.load(id);
    if (!['READY', 'PUBLISHED'].includes(r.status)) throw conflict('Faqat tayyor versiya kanalga chiqariladi');
    return this.db.$transaction(async (tx) => {
      await this.ensureChannels(tx, r.projectId);
      const ch = await tx.releaseChannel.findUnique({ where: { projectId_key: { projectId: r.projectId, key: channelKey } } });
      if (!ch) throw notFound('Kanal');
      const exists = await tx.releaseChannelEntry.findUnique({ where: { releaseId_channelId: { releaseId: id, channelId: ch.id } } });
      if (exists) throw conflict('Versiya bu kanalda allaqachon bor');
      await tx.releaseChannelEntry.create({ data: { releaseId: id, channelId: ch.id, projectId: r.projectId, promotedById: auth.userId } });
      if (r.status === 'READY') {
        await tx.release.update({ where: { id }, data: { status: 'PUBLISHED', publishedById: auth.userId, publishedAt: new Date(), rowVersion: { increment: 1 } } });
      }
      await this.audit.record(tx, { action: 'release.promoted', resourceType: 'release', resourceId: id, metadata: { channel: channelKey, version: r.version } });
      await this.outbox.add(tx, { type: 'release.published', eventKey: `release.published:${id}:${channelKey}`, aggregateType: 'release', aggregateId: id, payload: { version: r.version, channel: channelKey, projectId: r.projectId } });
      return { ok: true };
    });
  }

  async deprecate(id: string) {
    const r = await this.load(id);
    if (!['READY', 'PUBLISHED'].includes(r.status)) throw conflict('Bu holatdagi versiyani eskirgan deb belgilab bo\'lmaydi');
    await this.db.$transaction(async (tx) => {
      await tx.release.update({ where: { id }, data: { status: 'DEPRECATED', rowVersion: { increment: 1 } } });
      await this.audit.record(tx, { action: 'release.deprecated', resourceType: 'release', resourceId: id });
    });
    return { ok: true };
  }

  /** Bekor qilish: yangi deploymentlar taqiqlanadi, kutilayotgan maqsadlar bekor qilinadi. */
  async revoke(id: string, reason: string) {
    const r = await this.load(id);
    if (r.status === 'REVOKED') throw conflict('Versiya allaqachon bekor qilingan');
    if (UNSIGNED.includes(r.status)) throw conflict("Qoralamani o'chiring — bekor qilish faqat tayyor versiyalar uchun");
    await this.db.$transaction(async (tx) => {
      await tx.release.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason, rowVersion: { increment: 1 } } });
      const pending = await tx.deploymentTarget.findMany({ where: { toReleaseId: id, status: { in: ['PENDING', 'WAITING_WINDOW', 'BLOCKED_ENTITLEMENT'] } }, select: { id: true } });
      if (pending.length) {
        await tx.deploymentTarget.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: 'CANCELLED', finishedAt: new Date(), lastError: `Versiya bekor qilindi: ${reason}` } });
      }
      await this.audit.record(tx, { action: 'release.revoked', resourceType: 'release', resourceId: id, reason, metadata: { cancelledTargets: pending.length } });
      await this.outbox.add(tx, { type: 'release.revoked', eventKey: `release.revoked:${id}`, aggregateType: 'release', aggregateId: id, payload: { version: r.version, reason } });
    });
    return { ok: true };
  }

  async remove(id: string) {
    const r = await this.load(id);
    if (!UNSIGNED.includes(r.status)) throw conflict("Faqat qoralama versiyani o'chirish mumkin");
    if (await this.db.deployment.count({ where: { releaseId: id } })) throw conflict('Versiya deploymentlarda ishlatilgan');
    const refs = await this.db.deviceInstallation.count({ where: { OR: [{ currentReleaseId: id }, { desiredReleaseId: id }, { pinnedReleaseId: id }] } });
    if (refs) throw conflict("Versiya qurilma o'rnatmalarida ko'rsatilgan");
    await this.db.$transaction(async (tx) => {
      await tx.releaseArtifact.deleteMany({ where: { releaseId: id } });
      await tx.fileAttachment.deleteMany({ where: { entityType: 'RELEASE', entityId: id } });
      await tx.release.delete({ where: { id } });
      await this.audit.record(tx, { action: 'release.deleted', resourceType: 'release', resourceId: id, metadata: { version: r.version } });
    });
    return { ok: true };
  }
}
