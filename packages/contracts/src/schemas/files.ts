import { z } from 'zod';

/** Fayl biriktiriladigan obyektlar (polimorf, soft reference). */
export const ENTITY_TYPES = ['CLIENT', 'PROJECT', 'SUBSCRIPTION', 'INVOICE', 'PAYMENT', 'DEVICE', 'RELEASE', 'DEPLOYMENT'] as const;
export const entityTypeEnum = z.enum(ENTITY_TYPES);
export type EntityType = (typeof ENTITY_TYPES)[number];

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).refine((v) => !/[\\/]/.test(v), "Nomda / yoki \\ bo'lmasin"),
  parentId: z.uuid().optional().nullable(),
});
export const folderRenameSchema = folderCreateSchema.pick({ name: true });
export const attachSchema = z.object({ entityType: entityTypeEnum, entityId: z.uuid(), label: z.string().trim().max(120).optional().nullable() });
export type AttachInput = z.infer<typeof attachSchema>;

export interface FileItem {
  id: string; name: string; mimeType: string; sizeBytes: string; sha256: string | null; status: string;
  uploadedBy: string | null; createdAt: string; folderId: string | null;
  previousVersionId: string | null; hasNewerVersion: boolean; version: number;
  attachments: { id: string; entityType: string; entityId: string; label: string | null }[];
}
export interface FolderItem { id: string; name: string; parentId: string | null; fileCount: number; folderCount: number; createdAt: string }
export interface FolderListing { folder: { id: string; name: string } | null; breadcrumb: { id: string; name: string }[]; folders: FolderItem[] }
