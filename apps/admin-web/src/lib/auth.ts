import { queryOptions, useQuery } from '@tanstack/react-query';
import type { MeResponse } from '@ads/contracts';
import { api } from './api';

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => api.get<MeResponse>('/auth/me'),
  staleTime: 60_000,
  retry: false,
});

export function useMe() {
  return useQuery(meQuery);
}

export function useCan() {
  const { data } = useMe();
  const set = new Set(data?.permissions ?? []);
  return (...perms: string[]) => perms.every((p) => set.has(p));
}
