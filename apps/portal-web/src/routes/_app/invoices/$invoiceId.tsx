import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, FileDown } from 'lucide-react';
import type { PortalInvoiceDetail } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { PayInstructions } from '@/components/common/pay-instructions';
import { PayInvoicesButton } from '@/components/pay/pay-invoices-button';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { date, dateTime, periodRange } from '@/lib/format';
import { requireAccess, useAccess } from '@/lib/session';

export const Route = createFileRoute('/_app/invoices/$invoiceId')({ beforeLoad: requireAccess('finance'), component: InvoicePage });

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const { data: i, isLoading } = useQuery({ queryKey: ['invoices', invoiceId], queryFn: () => api.get<PortalInvoiceDetail>(`/invoices/${invoiceId}`) });
  const access = useAccess();
  if (isLoading) return <Skeleton className="h-48" />;
  if (!i) return null;
  const open = i.outstandingMinor !== '0' && i.status !== 'VOID';
  return (
    <>
      <Link to="/invoices" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Invoice'lar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{i.number}</span><StatusBadge status={i.status} label={i.status === 'OPEN' && i.paidMinor !== '0' ? "Qisman to'langan" : undefined} /></span>}
        description={<>Sana {date(i.issueDate)} · to'lov muddati <span className={i.overdueDays ? 'font-medium text-destructive' : undefined}>{date(i.dueDate)}{i.overdueDays ? ` (${i.overdueDays} kun kechikdi)` : ''}</span>{i.periodStart && <> · davr {periodRange(i.periodStart, i.periodEnd)}</>}</>}
        actions={<>
          {open && access.pay && <PayInvoicesButton invoices={[i]} />}
          <Button asChild variant={open && access.pay ? 'outline' : 'default'}><a href={`/api/v1/portal/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="mr-2 size-4" />PDF</a></Button>
        </>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><span className="text-sm text-muted-foreground">Jami</span><CardTitle className="text-xl"><Money minor={i.totalMinor} currency={i.currency} /></CardTitle></CardHeader>
          {i.currency === 'USD' && i.fxRate && <CardContent className="pt-0 text-xs text-muted-foreground">MB kursi {i.fxRate} · <Money minor={i.totalUzsMinor} currency="UZS" /></CardContent>}</Card>
        <Card><CardHeader className="pb-2"><span className="text-sm text-muted-foreground">To'langan</span><CardTitle className="text-xl"><Money minor={i.paidMinor} currency={i.currency} /></CardTitle></CardHeader>
          {i.creditedMinor !== '0' && <CardContent className="pt-0 text-xs text-muted-foreground">Tuzatish (credit note): <Money minor={i.creditedMinor} currency={i.currency} /></CardContent>}</Card>
        <Card className={i.overdueDays ? 'border-destructive/50' : undefined}><CardHeader className="pb-2"><span className="text-sm text-muted-foreground">Qoldiq</span><CardTitle className="text-xl"><Money minor={i.outstandingMinor} currency={i.currency} /></CardTitle></CardHeader></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="grid gap-4 lg:col-span-3">
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Xizmat</TableHead><TableHead className="text-right">Miqdor</TableHead><TableHead className="text-right">Summa</TableHead></TableRow></TableHeader>
              <TableBody>
                {i.lines.map((l) => (
                  <TableRow key={l.position}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right">{l.quantity}{l.prorationDen > 1 && <span className="block text-xs text-muted-foreground">{l.prorationNum}/{l.prorationDen} kun</span>}</TableCell>
                    <TableCell className="text-right"><Money minor={l.amountMinor} currency={i.currency} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {i.payments.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">To'lovlar</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {i.payments.map((p, k) => <div key={k} className="flex justify-between"><span><span className="font-mono">{p.code}</span> <span className="text-muted-foreground">{dateTime(p.appliedAt)}</span></span><Money minor={p.amountMinor} currency={p.currency} /></div>)}
              </CardContent>
            </Card>
          )}
        </div>
        {open && <div className="lg:col-span-2"><PayInstructions invoiceNumber={i.number} amountMinor={i.outstandingMinor} currency={i.currency} /></div>}
      </div>
    </>
  );
}
