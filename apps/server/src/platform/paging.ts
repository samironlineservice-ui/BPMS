import type { ListQuery, Paginated } from '@ads/contracts';

export const pageArgs = (q: Pick<ListQuery, 'page' | 'pageSize'>) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
export const paged = <T>(items: T[], total: number, q: Pick<ListQuery, 'page' | 'pageSize'>): Paginated<T> => ({
  items, total, page: q.page, pageSize: q.pageSize,
});
