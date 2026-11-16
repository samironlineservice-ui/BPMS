import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import type { DeploymentListItem } from '@ads/contracts';
import { type Column, DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { deploymentsQuery } from '@/features/devices/api';
import { DeploymentCreateSheet } from '@/features/devices/deployment-forms';

const search = z.object({ page: z.number().int().min(1).catch(1).default(1), q: z.string().optional(), status: z.string().optional() });
export const Route = createFileRoute('/_app/deployments/')({ validateSearch: search, component: DeploymentsPage });

const STATUSES = [['DRAFT', 'Qoralama'], ['PENDING_APPROVAL', 'Tasdiq kutilmoqda'], ['SCHEDULED', 'Rejalashtirilgan'], ['RUNNING', 'Bajarilmoqda'], ['PAUSED', "To'xtatilgan"], ['COMPLETED', 'Yakunlangan'], ['FAILED', 'Xato'], ['CANCELLED', 'Bekor qilingan']];

function DeploymentsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const set = (p: Partial<typeof s>) => navigate({ search: (prev) => ({ ...prev, ...p }) });
  const { data, isLoading } = useQuery(deploymentsQuery(s));
  const cols: Column<DeploymentListItem>[] = [
    { key: 'code', header: 'Kod', cell: (r) => <span className="font-mono text-xs font-medium">{r.code}</span> },
    { key: 'what', header: 'Nima', cell: (r) => <div><div className="font-medium">{r.componentName} <span className="font-mono">{r.version}</span></div><div className="text-xs text-muted-foreground">{r.projectName}</div></div> },
    { key: 'status', header: 'Holat', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'progress', header: 'Natija', cell: (r) => <div className="w-40"><Progress value={r.total ? ((r.succeeded + r.failed) / r.total) * 100 : 0} /><div className="mt-1 text-xs text-muted-foreground">{r.succeeded} muvaffaqiyatli · {r.failed} xato · {r.total} jami</div></div> },
    { key: 'when', header: 'Vaqt', cell: (r) => <span className="text-sm text-muted-foreground">{dateTime(r.startedAt ?? r.scheduledAt ?? r.createdAt)}</span> },
  ];
  return (
    <>
      <PageHeader title="Deploymentlar" description="Versiyalarni qurilmalarga o'rnatish rejalari: rahbar tasdig'i, bajarilish va natijalar"
        actions={can('deployments:create') && <DeploymentCreateSheet trigger={<Button><Plus className="mr-2 size-4" />Yangi deployment</Button>} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput value={s.q} onChange={(q) => set({ q, page: 1 })} placeholder="Kod yoki komponent…" />
        <Select value={s.status ?? 'all'} onValueChange={(v) => set({ status: v === 'all' ? undefined : v, page: 1 })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Barcha holatlar</SelectItem>{STATUSES.map(([k, l]) => <SelectItem key={k} value={k!}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DataTable columns={cols} loading={isLoading} rows={data?.items} rowKey={(r) => r.id} empty="Deploymentlar yo'q"
        onRowClick={(r) => navigate({ to: '/deployments/$deploymentId', params: { deploymentId: r.id } })}
        page={s.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })} />
    </>
  );
}
