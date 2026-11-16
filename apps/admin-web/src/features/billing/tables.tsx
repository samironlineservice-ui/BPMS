import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { InvoiceListItem, PaymentListItem, SubscriptionListItem } from '@ads/contracts';
import { type Column, DataTable } from '@/components/common/data-table';
import { Money } from '@/components/common/money';
import { SearchInput } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { date } from '@/lib/format';
import { INVOICE_STATUSES, invoicesQuery, KIND_LABELS, METHOD_LABELS, PAYMENT_STATUSES, paymentsQuery, SUB_STATUSES, subscriptionsQuery } from './api';

type Filters = { page: number; q?: string; status?: string; currency?: string; overdue?: string };

function FilterBar({ f, set, statuses, withCurrency, withOverdue, placeholder }: {
  f: Filters; set: (p: Partial<Filters>) => void; statuses: readonly (readonly [string, string])[]; withCurrency?: boolean; withOverdue?: boolean; placeholder: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder={placeholder} />
      <Select value={f.overdue === 'true' ? 'overdue' : (f.status ?? 'all')} onValueChange={(v) => set(v === 'overdue' ? { overdue: 'true', status: undefined, page: 1 } : { status: v === 'all' ? undefined : v, overdue: undefined, page: 1 })}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barcha holatlar</SelectItem>
          {withOverdue && <SelectItem value="overdue">Muddati o'tganlar</SelectItem>}
          {statuses.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
      {withCurrency && (
        <Select value={f.currency ?? 'all'} onValueChange={(v) => set({ currency: v === 'all' ? undefined : v, page: 1 })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Valyuta</SelectItem><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
        </Select>
      )}
    </div>
  );
}

/** URL'dagi (sahifa) yoki lokal (kartochka tab'i) filtrlar. */
export function useFilters(external?: { value: Filters; set: (p: Partial<Filters>) => void }) {
  const [local, setLocal] = useState<Filters>({ page: 1 });
  return external ?? { value: local, set: (p: Partial<Filters>) => setLocal((prev) => ({ ...prev, ...p })) };
}

export function SubscriptionsTable({ clientId, filters }: { clientId?: string; filters?: { value: Filters; set: (p: Partial<Filters>) => void } }) {
  const { value: f, set } = useFilters(filters);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(subscriptionsQuery({ ...f, clientId }));
  const cols: Column<SubscriptionListItem>[] = [
    { key: 'code', header: 'Kod', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    ...(clientId ? [] : [{ key: 'client', header: 'Mijoz', cell: (r: SubscriptionListItem) => <span className="font-medium">{r.client.name}</span> }]),
    { key: 'project', header: 'Loyiha', cell: (r) => r.project.name },
    { key: 'status', header: 'Holat', cell: (r) => <div className="flex items-center gap-1"><StatusBadge status={r.status} />{r.cancelAtPeriodEnd && <Badge variant="outline">davr oxirida tugaydi</Badge>}</div> },
    { key: 'mrr', header: 'MRR', className: 'text-right', cell: (r) => <Money minor={r.mrrMinor} currency={r.currency} /> },
    { key: 'next', header: 'Keyingi hisob', cell: (r) => <span className="text-sm">{date(r.nextBillingOn)}</span> },
  ];
  return (
    <>
      <FilterBar f={f} set={set} statuses={SUB_STATUSES} placeholder="Kod yoki mijoz…" />
      <DataTable columns={cols} loading={isLoading} rows={data?.items} rowKey={(r) => r.id} empty="Obunalar yo'q"
        onRowClick={(r) => navigate({ to: '/subscriptions/$subscriptionId', params: { subscriptionId: r.id } })}
        page={f.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })} />
    </>
  );
}

export function InvoicesTable({ clientId, filters }: { clientId?: string; filters?: { value: Filters; set: (p: Partial<Filters>) => void } }) {
  const { value: f, set } = useFilters(filters);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(invoicesQuery({ ...f, clientId }));
  const cols: Column<InvoiceListItem>[] = [
    { key: 'number', header: 'Raqam', cell: (r) => <div><div className="font-mono text-xs font-medium">{r.number}</div><div className="text-xs text-muted-foreground">{KIND_LABELS[r.kind]}{r.subscriptionCode ? ` · ${r.subscriptionCode}` : ''}</div></div> },
    ...(clientId ? [] : [{ key: 'client', header: 'Mijoz', cell: (r: InvoiceListItem) => <span className="font-medium">{r.client.name}</span> }]),
    { key: 'date', header: 'Sana / muddat', cell: (r) => <div className="text-sm">{date(r.issueDate)}<div className={r.overdueDays ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>{date(r.dueDate)}{r.overdueDays ? ` · ${r.overdueDays} kun kechikdi` : ''}</div></div> },
    { key: 'status', header: 'Holat', cell: (r) => <StatusBadge status={r.status} label={r.status === 'OPEN' && r.paidMinor !== '0' ? "Qisman to'langan" : undefined} /> },
    { key: 'total', header: 'Summa', className: 'text-right', cell: (r) => <Money minor={r.totalMinor} currency={r.currency} /> },
    { key: 'out', header: 'Qoldiq', className: 'text-right', cell: (r) => (r.outstandingMinor === '0' ? <span className="text-muted-foreground">—</span> : <Money minor={r.outstandingMinor} currency={r.currency} className="font-medium" />) },
  ];
  return (
    <>
      <FilterBar f={f} set={set} statuses={INVOICE_STATUSES} withCurrency withOverdue placeholder="Raqam yoki mijoz…" />
      <DataTable columns={cols} loading={isLoading} rows={data?.items} rowKey={(r) => r.id} empty="Invoice'lar yo'q"
        onRowClick={(r) => navigate({ to: '/invoices/$invoiceId', params: { invoiceId: r.id } })}
        page={f.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })} />
    </>
  );
}

export function PaymentsTable({ clientId, filters }: { clientId?: string; filters?: { value: Filters; set: (p: Partial<Filters>) => void } }) {
  const { value: f, set } = useFilters(filters);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(paymentsQuery({ ...f, clientId }));
  const cols: Column<PaymentListItem>[] = [
    { key: 'code', header: 'Kod', cell: (r) => <div><div className="font-mono text-xs font-medium">{r.code}</div><div className="text-xs text-muted-foreground">{METHOD_LABELS[r.method]}{r.externalRef ? ` · ${r.externalRef}` : ''}</div></div> },
    ...(clientId ? [] : [{ key: 'client', header: 'Mijoz', cell: (r: PaymentListItem) => <span className="font-medium">{r.client.name}</span> }]),
    { key: 'date', header: 'Sana', cell: (r) => <span className="text-sm">{date(r.receivedAt)}</span> },
    { key: 'status', header: 'Holat', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'amount', header: 'Summa', className: 'text-right', cell: (r) => <Money minor={r.amountMinor} currency={r.currency} className="font-medium" /> },
    { key: 'free', header: 'Taqsimlanmagan', className: 'text-right', cell: (r) => (r.unallocatedMinor === '0' ? <span className="text-muted-foreground">—</span> : <Money minor={r.unallocatedMinor} currency={r.currency} />) },
  ];
  return (
    <>
      <FilterBar f={f} set={set} statuses={PAYMENT_STATUSES} withCurrency placeholder="Kod, hujjat raqami, mijoz…" />
      <DataTable columns={cols} loading={isLoading} rows={data?.items} rowKey={(r) => r.id} empty="To'lovlar yo'q"
        onRowClick={(r) => navigate({ to: '/payments/$paymentId', params: { paymentId: r.id } })}
        page={f.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })} />
    </>
  );
}
