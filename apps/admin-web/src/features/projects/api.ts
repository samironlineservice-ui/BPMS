import { queryOptions } from '@tanstack/react-query';
import type { ClientListItem, ClientProjectItem, Paginated, ProjectDetail, ProjectListItem } from '@ads/contracts';
import type { ComboItem } from '@/components/common/async-combobox';
import { api } from '@/lib/api';

export const projectsQuery = (s: { page: number; q?: string; status?: string }) =>
  queryOptions({ queryKey: ['projects', 'list', s], queryFn: () => api.get<Paginated<ProjectListItem>>('/projects', { ...s, pageSize: 50 }) });
export const allProjectsQuery = queryOptions({
  queryKey: ['projects', 'all'], queryFn: () => api.get<Paginated<ProjectListItem>>('/projects', { pageSize: 100 }).then((r) => r.items), staleTime: 60_000,
});
export const projectQuery = (id: string) => queryOptions({ queryKey: ['projects', id], queryFn: () => api.get<ProjectDetail>(`/projects/${id}`) });
export const clientProjectsQuery = (f: { clientId?: string; projectId?: string }) =>
  queryOptions({ queryKey: ['client-projects', f], queryFn: () => api.get<ClientProjectItem[]>('/client-projects', f) });

export const searchClients = (q: string): Promise<ComboItem[]> =>
  api.get<Paginated<ClientListItem>>('/clients', { q: q || undefined, pageSize: 20 })
    .then((r) => r.items.map((c) => ({ id: c.id, label: c.displayName, sub: `${c.code}${c.tin ? ` · STIR ${c.tin}` : ''}` })));

export const PLATFORM_LABELS: Record<string, string> = { WINDOWS: 'Windows', LINUX: 'Linux', ANDROID: 'Android', ESP_IDF: 'ESP32' };
export const RUNTIME_LABELS: Record<string, string> = {
  SERVER_SERVICE: 'Server servisi', CONTAINER_STACK: 'Docker stack', STATIC_WEB: 'Statik web', DESKTOP_APP: 'Desktop ilova',
  FIRMWARE: 'Firmware (mikrokontroller)', AI_MODEL: 'AI model / data', MOBILE_APP: 'Mobil ilova',
};
export const MEMBER_ROLE_LABELS: Record<string, string> = { LEAD: 'Rahbar (lead)', DEVELOPER: 'Dasturchi', QA: 'Tester (QA)', SUPPORT: "Qo'llab-quvvatlash" };
export const PROJECT_STATUSES = [
  ['PLANNING', 'Rejada'], ['IN_DEVELOPMENT', 'Ishlab chiqilmoqda'], ['ACTIVE', 'Faol'], ['MAINTENANCE', "Qo'llab-quvvatlash"], ['DEPRECATED', 'Eskirgan'],
] as const;
export const CLIENT_PROJECT_STATUSES = [
  ['PROSPECT', 'Potensial'], ['ONBOARDING', 'Ulanmoqda'], ['ACTIVE', 'Faol'], ['SUSPENDED', "To'xtatilgan"], ['CHURNED', 'Ketgan'],
] as const;
