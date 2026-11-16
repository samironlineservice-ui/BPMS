import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth';
import { CLIENT_STATUSES, clientsQuery, clientTagsQuery, staffLookupQuery } from '@/features/clients/api';
import { ClientFormSheet } from '@/features/clients/client-form';

const search = z.object({
  page: z.number().int().min(1).catch(1).default(1),
  q: z.string().optional(), status: z.string().optional(), tag: z.string().optional(), managerId: z.string().optional(),
});
export const Route = createFileRoute('/_app/clients/')({ validateSearch: search, component: ClientsPage });

function ClientsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const { data, isLoading } = useQuery(clientsQuery(s));
  const tags = useQuery(clientTagsQuery);
  const staff = useQuery(staffLookupQuery);
  const set = (p: Partial<typeof s>) => navigate({ search: (prev) => ({ ...prev, ...p, page: p.page ?? 1 }) });
  return (
    <>
      <PageHeader title="Mijozlar" description="Kompaniyalar va jismoniy shaxslar, rekvizitlar, kontaktlar"
        actions={can('clients:create') && <ClientFormSheet trigger={<Button><Plus className="mr-2 size-4" />Yangi mijoz</Button>} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Nom, kod, STIR, telefon, JSHSHIR…" />
        <Select value={s.status ?? 'all'} onValueChange={(v) => set({ status: v === 'all' ? undefined : v })}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            {CLIENT_STATUSES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        {!!tags.data?.length && (
          <Select value={s.tag ?? 'all'} onValueChange={(v) => set({ tag: v === 'all' ? undefined : v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha teglar</SelectItem>
              {tags.data.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={s.managerId ?? 'all'} onValueChange={(v) => set({ managerId: v === 'all' ? undefined : v })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha menejerlar</SelectItem>
            {staff.data?.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        loading={isLoading} rows={data?.items} rowKey={(r) => r.id}
        onRowClick={(r) => navigate({ to: '/clients/$clientId', params: { clientId: r.id } })}
        page={s.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })}
        empty="Mijozlar topilmadi"
        columns={[
          { key: 'code', header: 'Kod', className: 'w-28', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: 'name', header: 'Mijoz', cell: (r) => (<div><div className="font-medium">{r.displayName}</div><div className="text-xs text-muted-foreground">{r.legalName}</div></div>) },
          { key: 'tin', header: 'STIR', cell: (r) => <span className="font-mono text-xs">{r.tin ?? '—'}</span> },
          { key: 'status', header: 'Holat', cell: (r) => <StatusBadge status={r.status} /> },
          { key: 'manager', header: 'Menejer', cell: (r) => <span className="text-sm">{r.accountManager?.fullName ?? '—'}</span> },
          { key: 'tags', header: 'Teglar', cell: (r) => <div className="flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div> },
          { key: 'projects', header: 'Loyihalar', className: 'text-right', cell: (r) => r.projectCount },
        ]}
      />
    </>
  );
}
