import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { z } from 'zod';
import { minorToDecimalString, type ReportsDto } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { monthShort } from '@/features/analytics/charts';
import { METHOD_LABELS, todayIso } from '@/features/billing/api';

const search = z.object({ from: z.string().optional(), to: z.string().optional() });
export const Route = createFileRoute('/_app/reports/')({ validateSearch: search, component: ReportsPage });

const MOVE_LABELS: Record<string, string> = { NEW: 'Yangi', EXPANSION: 'Kengayish', CONTRACTION: 'Qisqarish', CHURN: 'Ketish', REACTIVATION: 'Qaytish' };
const MOVES = ['NEW', 'EXPANSION', 'REACTIVATION', 'CONTRACTION', 'CHURN'];
const BUCKETS = [['current', 'Muddati kelmagan'], ['1-30', '1–30 kun'], ['31-60', '31–60 kun'], ['61-90', '61–90 kun'], ['90+', '90+ kun']] as const;

/** CSV (Excel'da ochiladi): UTF-8 BOM, ";" ajratgich. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Section({ title, description, onExport, children }: { title: string; description?: string; onExport?: () => void; children: React.ReactNode }) {
  const can = useCan();
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div><CardTitle className="text-base">{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
        {onExport && can('analytics:export') && <Button size="sm" variant="outline" onClick={onExport}><Download className="mr-1 size-4" />CSV</Button>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ReportsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, isLoading } = useQuery({ queryKey: ['reports', s], queryFn: () => api.get<ReportsDto>('/reports', s) });
  const months = data ? [...new Set(data.mrrMovements.map((m) => m.month))].sort() : [];
  const currencies = data ? [...new Set([...data.mrrMovements.map((m) => m.currency), ...data.aging.map((a) => a.currency)])].sort().reverse() : [];
  return (
    <>
      <PageHeader title="Hisobotlar" description="MRR harakati, debitorlik muddatlari, loyihalar bo'yicha daromad, to'lov usullari" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Dan"><Input type="date" value={data?.from ?? s.from ?? ''} onChange={(e) => navigate({ search: (p) => ({ ...p, from: e.target.value || undefined }) })} /></Field>
        <Field label="Gacha"><Input type="date" value={data?.to ?? s.to ?? todayIso()} onChange={(e) => navigate({ search: (p) => ({ ...p, to: e.target.value || undefined }) })} /></Field>
      </div>
      {isLoading && <Skeleton className="h-64" />}
      {data && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="MRR harakati" description="Oylar bo'yicha: yangi, kengayish, qaytish, qisqarish, ketish"
            onExport={() => downloadCsv('mrr-harakati.csv', [['Oy', 'Turi', 'Valyuta', 'Summa'], ...data.mrrMovements.map((m) => [m.month, MOVE_LABELS[m.type] ?? m.type, m.currency, minorToDecimalString(m.deltaMinor)])])}>
            {currencies.filter((c) => data.mrrMovements.some((m) => m.currency === c)).map((cur) => (
              <div key={cur} className="mb-3 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>{cur}</TableHead>{months.map((m) => <TableHead key={m} className="text-right">{monthShort(m)}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {MOVES.map((t) => (
                      <TableRow key={t}>
                        <TableCell className="text-sm">{MOVE_LABELS[t]}</TableCell>
                        {months.map((m) => { const v = data.mrrMovements.find((x) => x.month === m && x.type === t && x.currency === cur); return <TableCell key={m} className="text-right">{v ? <Money minor={v.deltaMinor} currency={cur} /> : <span className="text-muted-foreground">—</span>}</TableCell>; })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            {!data.mrrMovements.length && <p className="text-sm text-muted-foreground">Davrda harakat yo'q</p>}
          </Section>
          <Section title="Debitorlik muddatlari (aging)" description="Bugungi holatga, to'lanmagan qoldiqlar"
            onExport={() => downloadCsv('aging.csv', [['Valyuta', 'Muddat', 'Invoice', 'Summa'], ...data.aging.map((a) => [a.currency, a.bucket, a.invoices, minorToDecimalString(a.amountMinor)])])}>
            <Table>
              <TableHeader><TableRow><TableHead>Muddat</TableHead>{currencies.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {BUCKETS.map(([k, label]) => (
                  <TableRow key={k}>
                    <TableCell className={k === '90+' ? 'font-medium text-destructive' : 'text-sm'}>{label}</TableCell>
                    {currencies.map((c) => { const v = data.aging.find((a) => a.bucket === k && a.currency === c); return <TableCell key={c} className="text-right">{v ? <><Money minor={v.amountMinor} currency={c} /><span className="ml-1 text-xs text-muted-foreground">({v.invoices})</span></> : <span className="text-muted-foreground">—</span>}</TableCell>; })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <Section title="Daromad loyihalar bo'yicha" description="Buxgalteriya (4000 Daromad) — credit note'lar ayirilgan"
            onExport={() => downloadCsv('daromad-loyihalar.csv', [['Loyiha', 'Valyuta', 'Summa', "So'mda"], ...data.revenueByProject.map((r) => [r.projectName, r.currency, minorToDecimalString(r.amountMinor), minorToDecimalString(r.amountUzsMinor)])])}>
            <Table>
              <TableHeader><TableRow><TableHead>Loyiha</TableHead><TableHead className="text-right">Summa</TableHead><TableHead className="text-right">So'mda</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.revenueByProject.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.projectId ? <Link to="/projects/$projectId" params={{ projectId: r.projectId }} className="hover:underline">{r.projectName}</Link> : <span className="text-muted-foreground">{r.projectName}</span>}</TableCell>
                    <TableCell className="text-right"><Money minor={r.amountMinor} currency={r.currency} /></TableCell>
                    <TableCell className="text-right font-medium"><Money minor={r.amountUzsMinor} currency="UZS" /></TableCell>
                  </TableRow>
                ))}
                {!data.revenueByProject.length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Ma'lumot yo'q</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Section>
          <Section title="To'lovlar: usullar va eng yirik mijozlar"
            onExport={() => downloadCsv('tolovlar.csv', [['Usul', 'Valyuta', 'Soni', 'Summa'], ...data.paymentsByMethod.map((p) => [METHOD_LABELS[p.method] ?? p.method, p.currency, p.count, minorToDecimalString(p.amountMinor)])])}>
            <Table>
              <TableHeader><TableRow><TableHead>Usul</TableHead><TableHead className="text-right">Soni</TableHead><TableHead className="text-right">Summa</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.paymentsByMethod.map((p, i) => <TableRow key={i}><TableCell>{METHOD_LABELS[p.method] ?? p.method}</TableCell><TableCell className="text-right">{p.count}</TableCell><TableCell className="text-right"><Money minor={p.amountMinor} currency={p.currency} /></TableCell></TableRow>)}
              </TableBody>
            </Table>
            <div className="mt-4 text-sm font-medium">Eng ko'p to'lagan mijozlar (so'mda)</div>
            <Table>
              <TableBody>
                {data.topClients.map((c, i) => (
                  <TableRow key={c.clientId}><TableCell className="w-8 text-muted-foreground">{i + 1}</TableCell><TableCell><Link to="/clients/$clientId" params={{ clientId: c.clientId }} className="hover:underline">{c.clientName}</Link></TableCell><TableCell className="text-right"><Money minor={c.amountUzsMinor} currency="UZS" /></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </div>
      )}
    </>
  );
}
