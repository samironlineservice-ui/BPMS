import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FileText, Search } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import type { PortalInvoice } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PayInvoicesButton } from '@/components/pay/pay-invoices-button';
import { PageHeader } from '@/components/common/page-header';
import { Empty } from '@/components/common/stat';
import { StatusBadge } from '@/components/common/status-badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { date, periodRange } from '@/lib/format';
import { requireAccess, useAccess } from '@/lib/session';

const search = z.object({ status: z.enum(['all', 'open', 'overdue']).optional().catch(undefined) });
export const Route = createFileRoute('/_app/invoices/')({
  validateSearch: (s: Record<string, unknown>) => search.parse(s),
  beforeLoad: requireAccess('finance'),
  component: Invoices,
});

function Invoices() {
  const s = Route.useSearch();
  const status = s.status ?? 'all';
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['invoices', status], queryFn: () => api.get<PortalInvoice[]>('/invoices', { status }) });
  const access = useAccess();
  const open = useQuery({ queryKey: ['invoices', 'open'], queryFn: () => api.get<PortalInvoice[]>('/invoices', { status: 'open' }), enabled: access.pay });
  const rows = (data ?? []).filter((i) => !q || (i.number ?? '').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <PageHeader title="Invoice'lar" description="Hisob-fakturalar, to'lov holati va PDF nusxalari"
        actions={access.pay && open.data?.length ? <PayInvoicesButton invoices={open.data} label={open.data.length > 1 ? `Hammasini to'lash (${Math.min(open.data.length, 20)})` : "Onlayn to'lash"} /> : null} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={status} onValueChange={(v) => void navigate({ to: '/invoices', search: { status: v === 'all' ? undefined : (v as 'open' | 'overdue') } })}>
          <TabsList><TabsTrigger value="all">Hammasi</TabsTrigger><TabsTrigger value="open">To'lanmagan</TabsTrigger><TabsTrigger value="overdue">Muddati o'tgan</TabsTrigger></TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Raqam bo'yicha qidirish" className="pl-8" /></div>
      </div>
      {isLoading && <Skeleton className="h-48" />}
      {rows.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Raqam</TableHead><TableHead>Davr</TableHead><TableHead>Holat</TableHead><TableHead className="text-right">Summa</TableHead><TableHead className="text-right">Qoldiq</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id} className="cursor-pointer" onClick={() => void navigate({ to: '/invoices/$invoiceId', params: { invoiceId: i.id } })}>
                  <TableCell><span className="font-mono text-xs font-medium">{i.number}</span><div className="text-xs text-muted-foreground">{date(i.issueDate)}</div></TableCell>
                  <TableCell className="text-sm">{i.periodStart ? periodRange(i.periodStart, i.periodEnd) : 'Bir martalik'}<div className={i.overdueDays ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>muddat {date(i.dueDate)}{i.overdueDays ? ` · ${i.overdueDays} kun kechikdi` : ''}</div></TableCell>
                  <TableCell><StatusBadge status={i.status} label={i.status === 'OPEN' && i.paidMinor !== '0' ? "Qisman to'langan" : undefined} /></TableCell>
                  <TableCell className="text-right"><Money minor={i.totalMinor} currency={i.currency} /></TableCell>
                  <TableCell className="text-right">{i.outstandingMinor === '0' ? <span className="text-muted-foreground">—</span> : <Money minor={i.outstandingMinor} currency={i.currency} className="font-medium" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {data && !rows.length && <Empty icon={FileText} title={status === 'all' && !q ? "Invoice'lar yo'q" : 'Mos invoice topilmadi'} text={status !== 'all' ? "Bu bo'limda to'lanmagan hisob-fakturalar yo'q." : undefined} />}
    </>
  );
}
