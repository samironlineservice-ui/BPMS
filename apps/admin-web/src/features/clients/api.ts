import { queryOptions } from '@tanstack/react-query';
import type { ClientDetail, ClientListItem, NoteItem, Paginated } from '@ads/contracts';
import { api } from '@/lib/api';

export interface ClientsSearch { page: number; q?: string; status?: string; tag?: string; managerId?: string }

export const clientsQuery = (s: ClientsSearch) =>
  queryOptions({ queryKey: ['clients', 'list', s], queryFn: () => api.get<Paginated<ClientListItem>>('/clients', { ...s, pageSize: 20 }) });
export const clientQuery = (id: string) => queryOptions({ queryKey: ['clients', id], queryFn: () => api.get<ClientDetail>(`/clients/${id}`) });
export const clientNotesQuery = (id: string) =>
  queryOptions({ queryKey: ['clients', id, 'notes'], queryFn: () => api.get<NoteItem[]>(`/clients/${id}/notes`) });
export const clientTagsQuery = queryOptions({ queryKey: ['clients', 'tags'], queryFn: () => api.get<string[]>('/clients/tags'), staleTime: 60_000 });
export const staffLookupQuery = queryOptions({
  queryKey: ['users', 'lookup'], queryFn: () => api.get<{ id: string; fullName: string; email: string }[]>('/users/lookup'), staleTime: 5 * 60_000,
});

export const CLIENT_STATUSES = [
  ['LEAD', 'Lid'], ['ACTIVE', 'Faol'], ['SUSPENDED', "To'xtatilgan"], ['CHURNED', 'Ketgan'], ['ARCHIVED', 'Arxiv'],
] as const;
