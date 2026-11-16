import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { requestCountsQuery, requestsQuery } from '@/features/requests/api';
import { RequestsTable } from '@/features/requests/components';

const search = z.object({
  status: z.enum(['active', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'all']).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  mine: z.enum(['true']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});
export const Route = createFileRoute('/_app/requests/')({ validateSearch: (s: Record<string, unknown>) => search.parse(s), component: RequestsPage });

function RequestsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: '/requests/' });
  const filter = { status: s.status ?? 'active', q: s.q, mine: s.mine, page: s.page ?? 1 };
  const { data, isLoading } = useQuery(requestsQuery(filter));
  const counts = useQuery(requestCountsQuery);
  const set = (patch: Partial<typeof s>) => void navigate({ search: (p) => ({ ...p, ...patch, page: undefined }) });
  const tab = s.mine ? 'mine' : filter.status;
  return (
    <>
      <PageHeader
        title="Murojaatlar" description="Mijozlarning kabinetdan yuborgan savollari, muammolari va o'zgartirish so'rovlari"
        actions={counts.data && counts.data.unread > 0 && <Badge variant="destructive" className="py-1">{counts.data.unread} ta javob kutmoqda</Badge>}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => (v === 'mine' ? set({ mine: 'true', status: 'all' }) : set({ status: v as typeof s.status, mine: undefined }))}>
          <TabsList>
            <TabsTrigger value="active">Faol</TabsTrigger>
            <TabsTrigger value="mine">Menga biriktirilgan</TabsTrigger>
            <TabsTrigger value="RESOLVED">Hal qilingan</TabsTrigger>
            <TabsTrigger value="CLOSED">Yopilgan</TabsTrigger>
            <TabsTrigger value="all">Hammasi</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput value={s.q ?? ''} onChange={(q) => set({ q: q || undefined })} placeholder="Mavzu, kod yoki mijoz" />
      </div>
      <RequestsTable rows={data?.items} loading={isLoading} page={filter.page} total={data?.total} onPageChange={(page) => void navigate({ search: (p) => ({ ...p, page }) })} />
    </>
  );
}
