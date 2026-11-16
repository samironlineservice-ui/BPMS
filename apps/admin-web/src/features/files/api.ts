import { queryOptions } from '@tanstack/react-query';
import type { FileItem, FolderListing, Paginated } from '@ads/contracts';
import { api } from '@/lib/api';

export const filesQuery = (s: { page?: number; q?: string; folderId?: string; entityType?: string; entityId?: string }) =>
  queryOptions({ queryKey: ['files', s], queryFn: () => api.get<Paginated<FileItem>>('/files', { ...s, pageSize: 50 }) });
export const foldersQuery = (parentId?: string) =>
  queryOptions({ queryKey: ['folders', parentId ?? 'root'], queryFn: () => api.get<FolderListing>('/folders', { parentId }) });
export const versionsQuery = (id: string) => queryOptions({ queryKey: ['files', 'versions', id], queryFn: () => api.get<FileItem[]>(`/files/${id}/versions`) });
export const downloadUrl = (id: string, inline = false) => `/api/v1/files/${id}/download${inline ? '?inline=1' : ''}`;
