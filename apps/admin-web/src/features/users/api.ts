import { queryOptions } from '@tanstack/react-query';
import type { Paginated, PermissionItem, RoleDetail, RoleListItem, UserDetail, UserListItem } from '@ads/contracts';
import { api } from '@/lib/api';

export const usersQuery = (p: { page: number; q?: string; status?: string }) =>
  queryOptions({ queryKey: ['users', p], queryFn: () => api.get<Paginated<UserListItem>>('/users', { ...p, pageSize: 20 }) });
export const userQuery = (id: string) => queryOptions({ queryKey: ['users', id], queryFn: () => api.get<UserDetail>(`/users/${id}`) });
export const rolesQuery = queryOptions({ queryKey: ['roles'], queryFn: () => api.get<RoleListItem[]>('/roles'), staleTime: 60_000 });
export const roleQuery = (id: string) => queryOptions({ queryKey: ['roles', id], queryFn: () => api.get<RoleDetail>(`/roles/${id}`) });
export const permissionsQuery = queryOptions({ queryKey: ['permissions'], queryFn: () => api.get<PermissionItem[]>('/permissions'), staleTime: Infinity });

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Bosh sahifa', clients: 'Mijozlar', projects: 'Loyihalar', plans: 'Tariflar', subscriptions: 'Obunalar',
  invoices: 'Invoicelar', payments: "To'lovlar", refunds: 'Refundlar', credit_notes: 'Credit note', finance: 'Moliya',
  analytics: 'Hisobotlar', devices: 'Qurilmalar', releases: 'Versiyalar', deployments: 'Deploymentlar', files: 'Fayllar',
  notifications: 'Bildirishnomalar', users: 'Foydalanuvchilar', portal_users: 'Portal foydalanuvchilari', audit: 'Audit',
  settings: 'Sozlamalar', approvals: 'Tasdiqlar',
};
