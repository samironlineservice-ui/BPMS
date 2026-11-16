import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type AttachInput, type EntityType, entityTypeEnum, type FileItem, type FolderItem, type FolderListing, type Paginated } from '@ads/contracts';
import type { Prisma } from '@ads/db';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db, type DbOrTx } from '../../platform/db.service.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../platform/errors.js';
import { sanitizeFilename, sniffMime } from '../../platform/mime.js';
import { pageArgs, paged } from '../../platform/paging.js';
import { StorageService } from '../../platform/storage.service.js';

const fileInclude = {
  attachments: { select: { id: true, entityType: true, entityId: true, label: true } },
  nextVersion: { select: { id: true } },
} satisfies Prisma.FileInclude;
type FileRow = Prisma.FileGetPayload<{ include: typeof fileInclude }>;

const uploadFields = z.object({
  folderId: z.uuid().optional(),
  entityType: entityTypeEnum.optional(),
  entityId: z.uuid().optional(),
  label: z.string().trim().max(120).optional(),
  previousVersionId: z.uuid().optional(),
});

export interface FileListQuery { page: number; pageSize: number; q?: string; folderId?: string; entityType?: EntityType; entityId?: string }

@Injectable()
export class FilesService {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly storage: StorageService) {}

  private async toItems(rows: FileRow[]): Promise<FileItem[]> {
    const ids = [...new Set(rows.map((r) => r.uploadedById).filter((x): x is string => !!x))];
    const users = ids.length ? await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    const versions = await this.versionNumbers(rows.map((r) => r.id));
    return rows.map((f) => ({
      id: f.id, name: f.originalName, mimeType: f.mimeType, sizeBytes: f.sizeBytes.toString(), sha256: f.sha256, status: f.status,
      uploadedBy: f.uploadedById ? (names.get(f.uploadedById) ?? null) : null, createdAt: f.createdAt.toISOString(), folderId: f.folderId,
      previousVersionId: f.previousVersionId, hasNewerVersion: !!f.nextVersion, version: versions.get(f.id) ?? 1, attachments: f.attachments,
    }));
  }

  /** Versiya raqami = zanjirdagi ajdodlar soni + 1 (rekursiv CTE). */
  private async versionNumbers(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.db.$queryRaw<{ id: string; depth: number }[]>`
      WITH RECURSIVE chain AS (
        SELECT id, previous_version_id, 1 AS depth FROM files WHERE id = ANY(${ids}::uuid[])
        UNION ALL
        SELECT c.id, f.previous_version_id, c.depth + 1 FROM chain c JOIN files f ON f.id = c.previous_version_id
      ) SELECT id::text AS id, max(depth)::int AS depth FROM chain GROUP BY id`;
    return new Map(rows.map((r) => [r.id, Number(r.depth)]));
  }

  async list(q: FileListQuery): Promise<Paginated<FileItem>> {
    const term = q.q?.trim();
    const where: Prisma.FileWhereInput = {
      deletedAt: null,
      nextVersion: { is: null }, // faqat oxirgi versiyalar
      ...(q.entityType && q.entityId
        ? { attachments: { some: { entityType: q.entityType, entityId: q.entityId } } }
        : term ? {} : { folderId: q.folderId && q.folderId !== 'root' ? q.folderId : null }),
      ...(term ? { originalName: { contains: term, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.file.findMany({ where, include: fileInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.db.file.count({ where }),
    ]);
    return paged(await this.toItems(rows), total, q);
  }

  async versions(id: string): Promise<FileItem[]> {
    const chain: FileRow[] = [];
    let cur = await this.db.file.findUnique({ where: { id }, include: fileInclude });
    if (!cur) throw notFound('Fayl');
    while (cur && chain.length < 100) {
      chain.push(cur);
      cur = cur.previousVersionId ? await this.db.file.findUnique({ where: { id: cur.previousVersionId }, include: fileInclude }) : null;
    }
    return this.toItems(chain);
  }

  async upload(req: FastifyRequest, auth: AuthContext): Promise<FileItem> {
    if (!req.isMultipart()) throw badRequest('multipart/form-data kutilgan');
    const part = await req.file();
    if (!part) throw badRequest('Fayl topilmadi');
    const field = (n: string) => {
      const v = part.fields[n];
      const one = Array.isArray(v) ? v[0] : v;
      return one && one.type === 'field' ? String(one.value) || undefined : undefined;
    };
    const meta = uploadFields.parse({
      folderId: field('folderId'), entityType: field('entityType'), entityId: field('entityId'), label: field('label'), previousVersionId: field('previousVersionId'),
    });
    if (!!meta.entityType !== !!meta.entityId) throw badRequest('entityType va entityId birga beriladi');
    if (meta.folderId) await this.ensureFolder(meta.folderId);
    if (meta.entityType && meta.entityId) await this.ensureEntity(meta.entityType, meta.entityId);
    let prev: FileRow | null = null;
    if (meta.previousVersionId) {
      prev = await this.db.file.findFirst({ where: { id: meta.previousVersionId, deletedAt: null }, include: fileInclude });
      if (!prev) throw notFound('Avvalgi versiya');
      if (prev.nextVersion) throw conflict('Bu faylning yangiroq versiyasi allaqachon bor');
    }

    let stored;
    try {
      stored = await this.storage.put(part.file);
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError(413, 'FILE_TOO_LARGE', 'Fayl hajmi chegaradan katta');
      throw e;
    }
    if (part.file.truncated) {
      await this.storage.remove(stored.key);
      throw new AppError(413, 'FILE_TOO_LARGE', 'Fayl hajmi chegaradan katta');
    }
    const name = sanitizeFilename(part.filename);
    try {
      const file = await this.db.$transaction(async (tx) => {
        const f = await tx.file.create({
          data: {
            storageKey: stored.key, bucket: this.storage.bucket, originalName: name, mimeType: sniffMime(stored.head, name),
            sizeBytes: stored.size, sha256: stored.sha256, status: 'AVAILABLE', uploadedByType: 'STAFF', uploadedById: auth.userId,
            folderId: meta.folderId ?? prev?.folderId ?? null, previousVersionId: prev?.id ?? null,
          },
        });
        // Yangi versiya avvalgisining biriktirmalarini meros oladi
        const links = prev ? prev.attachments.map((a) => ({ entityType: a.entityType, entityId: a.entityId, label: a.label })) : [];
        if (meta.entityType && meta.entityId) links.push({ entityType: meta.entityType, entityId: meta.entityId, label: meta.label ?? null });
        for (const l of links) {
          await tx.fileAttachment.upsert({
            where: { fileId_entityType_entityId: { fileId: f.id, entityType: l.entityType, entityId: l.entityId } },
            create: { fileId: f.id, ...l, attachedById: auth.userId }, update: {},
          });
        }
        await this.audit.record(tx, {
          action: prev ? 'file.version_uploaded' : 'file.uploaded', resourceType: 'file', resourceId: f.id,
          metadata: { name, size: stored.size.toString(), sha256: stored.sha256, previousVersionId: prev?.id, entityType: meta.entityType, entityId: meta.entityId },
        });
        return tx.file.findUniqueOrThrow({ where: { id: f.id }, include: fileInclude });
      });
      return (await this.toItems([file]))[0]!;
    } catch (e) {
      await this.storage.remove(stored.key);
      throw e;
    }
  }

  async openForDownload(id: string) {
    const f = await this.db.file.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw notFound('Fayl');
    if (f.status !== 'AVAILABLE') throw forbidden('Fayl yuklab olish uchun mavjud emas');
    await this.audit.record(this.db, { action: 'file.downloaded', resourceType: 'file', resourceId: id, metadata: { name: f.originalName } });
    return { file: f, stream: this.storage.read(f.storageKey) };
  }

  /** Hujjatni o'chirish = butun versiyalar zanjirini (soft) o'chirish. */
  async remove(id: string) {
    const head = await this.db.file.findFirst({ where: { id, deletedAt: null } });
    if (!head) throw notFound('Fayl');
    const chain = await this.db.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE up AS (
        SELECT id, previous_version_id FROM files WHERE id = ${id}::uuid
        UNION ALL SELECT f.id, f.previous_version_id FROM files f JOIN up ON f.id = up.previous_version_id
      ), down AS (
        SELECT id FROM files WHERE id = ${id}::uuid
        UNION ALL SELECT f.id FROM files f JOIN down ON f.previous_version_id = down.id
      ) SELECT id::text AS id FROM up UNION SELECT id::text FROM down`;
    const ids = chain.map((r) => r.id);
    const files = await this.db.file.findMany({
      where: { id: { in: ids }, deletedAt: null }, include: { _count: { select: { artifacts: true, invoicePdfs: true, paymentReceipts: true } } },
    });
    const now = new Date();
    if (files.some((f) => f.retentionUntil && f.retentionUntil > now)) throw conflict('Hujjatni saqlash muddati hali tugamagan');
    if (files.some((f) => f._count.artifacts || f._count.invoicePdfs || f._count.paymentReceipts))
      throw conflict("Fayl versiya, invoice yoki to'lov hujjati sifatida ishlatilmoqda");
    await this.db.$transaction(async (tx) => {
      await tx.file.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { status: 'DELETED', deletedAt: now } });
      await this.audit.record(tx, { action: 'file.deleted', resourceType: 'file', resourceId: id, metadata: { name: head.originalName, versions: files.length } });
    });
    return { ok: true };
  }

  async attach(id: string, input: AttachInput, auth: AuthContext) {
    const f = await this.db.file.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw notFound('Fayl');
    await this.ensureEntity(input.entityType, input.entityId);
    const a = await this.db.fileAttachment.upsert({
      where: { fileId_entityType_entityId: { fileId: id, entityType: input.entityType, entityId: input.entityId } },
      create: { fileId: id, entityType: input.entityType, entityId: input.entityId, label: input.label ?? null, attachedById: auth.userId },
      update: { label: input.label ?? null },
    });
    await this.audit.record(this.db, { action: 'file.attached', resourceType: 'file', resourceId: id, metadata: { entityType: input.entityType, entityId: input.entityId } });
    return { id: a.id };
  }

  async detach(attachmentId: string) {
    const a = await this.db.fileAttachment.findUnique({ where: { id: attachmentId } });
    if (!a) throw notFound('Biriktirma');
    await this.db.fileAttachment.delete({ where: { id: attachmentId } });
    await this.audit.record(this.db, { action: 'file.detached', resourceType: 'file', resourceId: a.fileId, metadata: { entityType: a.entityType, entityId: a.entityId } });
    return { ok: true };
  }

  // ── Papkalar ──
  async folders(parentId: string | null): Promise<FolderListing> {
    const parent = parentId ? await this.ensureFolder(parentId) : null;
    const rows = await this.db.folder.findMany({
      where: { parentId, deletedAt: null },
      include: { _count: { select: { files: { where: { deletedAt: null, nextVersion: { is: null } } }, children: { where: { deletedAt: null } } } } },
      orderBy: { name: 'asc' },
    });
    const crumbIds = parent ? parent.path.split('/').filter(Boolean) : [];
    const crumbs = crumbIds.length ? await this.db.folder.findMany({ where: { id: { in: crumbIds } }, select: { id: true, name: true } }) : [];
    const byId = new Map(crumbs.map((c) => [c.id, c]));
    return {
      folder: parent ? { id: parent.id, name: parent.name } : null,
      breadcrumb: crumbIds.map((id) => byId.get(id)).filter((x): x is { id: string; name: string } => !!x),
      folders: rows.map((r): FolderItem => ({
        id: r.id, name: r.name, parentId: r.parentId, fileCount: r._count.files, folderCount: r._count.children, createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private async assertFolderNameFree(parentId: string | null, name: string, exceptId?: string) {
    const dup = await this.db.folder.findFirst({
      where: { parentId, deletedAt: null, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (dup) throw conflict('Bu joyda shunday nomli papka bor');
  }

  async createFolder(name: string, parentId: string | null | undefined) {
    const parent = parentId ? await this.ensureFolder(parentId) : null;
    await this.assertFolderNameFree(parent?.id ?? null, name);
    return this.db.$transaction(async (tx) => {
      const f = await tx.folder.create({ data: { name, parentId: parent?.id ?? null, ownerType: 'GENERAL', path: '' } });
      await tx.folder.update({ where: { id: f.id }, data: { path: `${parent?.path ?? '/'}${f.id}/` } });
      await this.audit.record(tx, { action: 'folder.created', resourceType: 'folder', resourceId: f.id, metadata: { name, parentId } });
      return { id: f.id };
    });
  }

  async renameFolder(id: string, name: string) {
    const f = await this.ensureFolder(id);
    await this.assertFolderNameFree(f.parentId, name, id);
    await this.db.folder.update({ where: { id }, data: { name } });
    await this.audit.record(this.db, { action: 'folder.renamed', resourceType: 'folder', resourceId: id, changes: { before: { name: f.name }, after: { name } } });
    return { ok: true };
  }

  async removeFolder(id: string) {
    await this.ensureFolder(id);
    const [files, children] = await Promise.all([
      this.db.file.count({ where: { folderId: id, deletedAt: null } }),
      this.db.folder.count({ where: { parentId: id, deletedAt: null } }),
    ]);
    if (files || children) throw conflict("Papka bo'sh emas");
    await this.db.folder.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record(this.db, { action: 'folder.deleted', resourceType: 'folder', resourceId: id });
    return { ok: true };
  }

  private async ensureFolder(id: string) {
    const f = await this.db.folder.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw notFound('Papka');
    return f;
  }

  async ensureEntity(type: EntityType, id: string, db: DbOrTx = this.db) {
    const where = { where: { id } };
    const n = await ({
      CLIENT: () => db.client.count({ where: { id, deletedAt: null } }),
      PROJECT: () => db.project.count({ where: { id, deletedAt: null } }),
      SUBSCRIPTION: () => db.subscription.count(where),
      INVOICE: () => db.invoice.count(where),
      PAYMENT: () => db.payment.count(where),
      DEVICE: () => db.device.count(where),
      RELEASE: () => db.release.count(where),
      DEPLOYMENT: () => db.deployment.count(where),
    } satisfies Record<EntityType, () => Promise<number>>)[type]();
    if (!n) throw notFound('Biriktiriladigan obyekt');
  }
}
