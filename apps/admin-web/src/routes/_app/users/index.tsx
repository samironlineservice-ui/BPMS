import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { z } from 'zod';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth';
import { ago } from '@/lib/format';
import { usersQuery } from '@/features/users/api';
import { InviteDialog } from '@/features/users/invite-dialog';

const search = z.object({ page: z.number().int().min(1).catch(1).default(1), q: z.string().optional(), status: z.string().optional() });

export const Route = createFileRoute('/_app/users/')({ validateSearch: search, component: UsersPage });

function UsersPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const { data, isLoading } = useQuery(usersQuery(s));
  const set = (patch: Partial<typeof s>) => navigate({ search: (prev) => ({ ...prev, ...patch }) });
  return (
    <>
      <PageHeader title="Foydalanuvchilar" description="Xodimlar, rollar va ruxsatlar" actions={can('users:invite') && <InviteDialog />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Ism yoki email…" className="max-w-xs" defaultValue={s.q} onChange={(e) => set({ q: e.target.value || undefined, page: 1 })} />
        <Select value={s.status ?? 'all'} onValueChange={(v) => set({ status: v === 'all' ? undefined : v, page: 1 })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            <SelectItem value="ACTIVE">Faol</SelectItem>
            <SelectItem value="INVITED">Taklif qilingan</SelectItem>
            <SelectItem value="DEACTIVATED">O'chirilgan</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate({ to: '/users/$userId', params: { userId: r.id } })}
        page={s.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })}
        columns={[
          { key: 'name', header: 'Xodim', cell: (r) => (<div><div className="font-medium">{r.fullName}</div><div className="text-xs text-muted-foreground">{r.email}</div></div>) },
          { key: 'roles', header: 'Rollar', cell: (r) => (<div className="flex flex-wrap gap-1">{r.roles.filter((x) => !x.key.startsWith('u_')).map((x) => <Badge key={x.id} variant="secondary">{x.name}</Badge>)}{r.roles.some((x) => x.key.startsWith('u_')) && <Badge variant="outline">+ shaxsiy ruxsatlar</Badge>}</div>) },
          { key: 'status', header: 'Holat', cell: (r) => <StatusBadge status={r.status} /> },
          { key: 'mfa', header: '2FA', cell: (r) => (r.mfaEnabled ? <ShieldCheck className="size-4 text-success" /> : <ShieldOff className="size-4 text-muted-foreground" />) },
          { key: 'last', header: 'Oxirgi kirish', cell: (r) => <span className="text-sm text-muted-foreground">{ago(r.lastLoginAt)}</span> },
        ]}
      />
    </>
  );
}
