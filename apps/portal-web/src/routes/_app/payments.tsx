import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Banknote } from 'lucide-react';
import type { PortalPayment } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { TopupCard } from '@/components/pay/topup-card';
import { Empty } from '@/components/common/stat';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { PAYMENT_METHODS, requireAccess } from '@/lib/session';

export const Route = createFileRoute('/_app/payments')({ beforeLoad: requireAccess('finance'), component: Payments });

function Payments() {
  const { data, isLoading } = useQuery({ queryKey: ['payments'], queryFn: () => api.get<PortalPayment[]>('/payments') });
  return (
    <>
      <PageHeader title="To'lovlar" description="Qabul qilingan to'lovlar va ular qaysi invoice'larga taqsimlangani" />
      <div className="mb-4"><TopupCard /></div>
      {isLoading && <Skeleton className="h-48" />}
      {data && data.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader><TableRow><TableHead>To'lov</TableHead><TableHead>Usul</TableHead><TableHead>Taqsimot</TableHead><TableHead className="text-right">Summa</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><span className="font-mono text-xs font-medium">{p.code}</span><div className="text-xs text-muted-foreground">{date(p.receivedAt)}</div></TableCell>
                  <TableCell className="text-sm">{PAYMENT_METHODS[p.method] ?? p.method}{p.externalRef && <div className="font-mono text-xs text-muted-foreground">{p.externalRef}</div>}</TableCell>
                  <TableCell className="text-sm">
                    <div className="grid gap-0.5">
                      {p.allocations.map((a, k) => (
                        <Link key={k} to="/invoices/$invoiceId" params={{ invoiceId: a.invoiceId }} className="flex gap-2 hover:underline">
                          <span className="font-mono text-xs">{a.invoiceNumber}</span><Money minor={a.amountMinor} currency={a.currency} className="text-xs text-muted-foreground" />
                        </Link>
                      ))}
                      {p.unallocatedMinor !== '0' && <span className="text-xs text-muted-foreground">Avans (keyingi invoice'larga): <Money minor={p.unallocatedMinor} currency={p.currency} /></span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><Money minor={p.amountMinor} currency={p.currency} className="font-medium" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {data && !data.length && <Empty icon={Banknote} title="To'lovlar hali yo'q" text="Bank o'tkazmasi yoki naqd to'lov qabul qilingach, shu yerda ko'rinadi." />}
    </>
  );
}
