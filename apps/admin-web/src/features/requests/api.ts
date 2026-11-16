import { queryOptions } from '@tanstack/react-query';
import type { Paginated, RequestDetail, RequestListItem } from '@ads/contracts';
import { api } from '@/lib/api';

export interface RequestFilter { status?: string; clientId?: string; q?: string; mine?: string; page?: number }

export const requestCountsQuery = queryOptions({
  queryKey: ['requests', 'counts'], queryFn: () => api.get<{ active: number; unread: number }>('/requests/counts'), refetchInterval: 60_000,
});
export const requestsQuery = (f: RequestFilter) => queryOptions({
  queryKey: ['requests', 'list', f], queryFn: () => api.get<Paginated<RequestListItem>>('/requests', { ...f, pageSize: 25 }),
});
export const requestQuery = (id: string) => queryOptions({ queryKey: ['requests', id], queryFn: () => api.get<RequestDetail>(`/requests/${id}`) });
