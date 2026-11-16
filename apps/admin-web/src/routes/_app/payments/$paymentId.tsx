import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, CircleSlash, RotateCcw, Shuffle, Undo2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Confirm } from '@/components/common/confirm';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { date, dateTime, money } from '@/lib/format';
import { METHOD_LABELS, minorToInput, MONEY_KEYS, paymentQuery } from '@/features/billing/api';
import { AllocateDialog, ReasonDialog } from '@/features/billing/money-dialogs';
import { ResourceHistory } from '@/features/common-audit';

export const Route = createFileRoute('/_app/payments/$paymentId')({ component: PaymentPage });

function PaymentPage() {
  const { paymentId } = Route.useParams();
  const { data: p, isLoading } = useQuery(paymentQuery(paymentId));
  const can = useCan();
  const qc = useQueryClient();
  const refresh = () => { for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: k }); };
  const post = useMutation({
    mutationFn: (x: { path: string; body?: unknown; ok: string }) => api.post(x.path, x.body ?? {}).then(() => x.ok),
    onSuccess: (ok) => { toast.success(ok); refresh(); },
    onError: (e) => handleApiError(e),
  });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!p) return null;
  const free = p.unallocatedMinor !== '0';
  return (
    <>
      <Link to="/payments" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />To'lovlar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{p.code}</span><StatusBadge status={p.status} /></span>}
        description={<span><Link to="/clients/$clientId" params={{ clientId: p.client.id }} className="hover:underline">{p.client.name}</Link> · {METHOD_LABELS[p.method]} · {date(p.receivedAt)}{p.externalRef ? ` · ${p.externalRef}` : ''}</span>}
        actions={
          <>
            {p.status === 'PENDING_APPROVAL' && can('payments:approve') && (
              <>
                <Button disabled={post.isPending} onClick={() => post.mutate({ path: `/payments/${p.id}/approve`, ok: "To'lov tasdiqlandi va taqsimlandi" })}><Check className="mr-2 size-4" />Tasdiqlash</Button>
                <ReasonDialog title="To'lovni rad etish" destructive confirmText="Rad etish" trigger={<Button variant="outline"><CircleSlash className="mr-2 size-4" />Rad etish</Button>}
                  onSubmit={(x) => api.post(`/payments/${p.id}/reject`, { reason: x.reason }).then(() => toast.success('Rad etildi'))} />
              </>
            )}
            {p.status === 'POSTED' && free && can('payments:allocate') && (
              <>
                <AllocateDialog payment={p} trigger={<Button variant="outline"><Shuffle className="mr-2 size-4" />Taqsimlash</Button>} />
                <Button variant="outline" disabled={post.isPending} onClick={() => post.mutate({ path: `/payments/clients/${p.client.id}/auto-allocate`, ok: 'Avtomatik taqsimlandi' })}><Wand2 className="mr-2 size-4" />Avtomatik</Button>
              </>
            )}
            {p.status === 'POSTED' && free && can('refunds:request') && (
              <ReasonDialog title="Pulni qaytarish (refund)" description="Faqat taqsimlanmagan qismdan. Rahbar tasdiqlaydi, keyin pul qaytarilgani belgilanadi." withAmount
                amountLabel={`Summa (${p.currency})`} defaultAmount={minorToInput(p.unallocatedMinor)} confirmText="So'rov yuborish"
                trigger={<Button variant="outline"><RotateCcw className="mr-2 size-4" />Refund</Button>}
                onSubmit={(x) => api.post<{ status: string }>(`/payments/${p.id}/refunds`, { amount: x.amount, reason: x.reason }).then((r) => toast.success(r.status === 'APPROVED' ? 'Refund tasdiqlandi — pul qaytarilgach belgilang' : "Refund so'rovi yuborildi"))} />
            )}
          </>
        }
      />
      {p.status === 'PENDING_APPROVAL' && <Alert className="mb-4"><AlertTitle>Rahbar tasdig'i kutilmoqda</AlertTitle><AlertDescription>Tasdiqlanmaguncha to'lov balansga va invoice'larga ta'sir qilmaydi. Kiritgan: {p.createdBy ?? '—'}.</AlertDescription></Alert>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Summa</CardDescription><CardTitle className="text-xl"><Money minor={p.amountMinor} currency={p.currency} /></CardTitle></CardHeader>
          {p.currency === 'USD' && <CardContent className="pt-0 text-xs text-muted-foreground">Kurs {p.fxRate} · {money(p.amountUzsMinor, 'UZS')}</CardContent>}</Card>
        <Card><CardHeader className="pb-2"><CardDescription>Taqsimlangan</CardDescription><CardTitle className="text-xl"><Money minor={p.allocatedMinor} currency={p.currency} /></CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Qaytarilgan</CardDescription><CardTitle className="text-xl"><Money minor={p.refundedMinor} currency={p.currency} /></CardTitle></CardHeader></Card>
        <Card className={free ? 'border-primary/40' : undefined}><CardHeader className="pb-2"><CardDescription>Taqsimlanmagan (kredit)</CardDescription><CardTitle className="text-xl"><Money minor={p.unallocatedMinor} currency={p.currency} /></CardTitle></CardHeader></Card>
      </div>
      <Tabs defaultValue="alloc">
        <TabsList>
          <TabsTrigger value="alloc">Taqsimot ({p.allocations.length})</TabsTrigger>
          <TabsTrigger value="refunds">Refund ({p.refunds.length})</TabsTrigger>
          <TabsTrigger value="info">Ma'lumot</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="alloc">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Sana</TableHead><TableHead className="text-right">To'lovdan</TableHead><TableHead className="text-right">Invoice'ga</TableHead><TableHead className="text-right">Kurs farqi</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {p.allocations.map((a) => (
                  <TableRow key={a.id} className={a.reversalOfId || a.reversed ? 'text-muted-foreground' : undefined}>
                    <TableCell><Link to="/invoices/$invoiceId" params={{ invoiceId: a.invoiceId }} className="font-mono text-xs hover:underline">{a.invoiceNumber}</Link>{a.reversalOfId && <Badge variant="outline" className="ml-2">bekor qilish</Badge>}{a.reversed && <Badge variant="outline" className="ml-2">bekor qilingan</Badge>}</TableCell>
                    <TableCell className="text-sm">{dateTime(a.appliedAt)}</TableCell>
                    <TableCell className="text-right"><Money minor={a.amountPaymentMinor} currency={a.paymentCurrency} /></TableCell>
                    <TableCell className="text-right"><Money minor={a.amountInvoiceMinor} currency={a.invoiceCurrency} />{a.paymentCurrency !== a.invoiceCurrency && <div className="text-xs text-muted-foreground">@ {a.fxRate}</div>}</TableCell>
                    <TableCell className="text-right">{a.fxDiffUzsMinor === '0' ? '—' : <Money minor={a.fxDiffUzsMinor} currency="UZS" />}</TableCell>
                    <TableCell className="w-12 text-right">
                      {!a.reversalOfId && !a.reversed && can('payments:allocate') && (
                        <Confirm title="Taqsimotni bekor qilish" description="Summa kreditga qaytadi, invoice qoldig'i tiklanadi." destructive
                          trigger={<Button variant="ghost" size="icon" aria-label="Bekor qilish"><Undo2 className="size-4" /></Button>}
                          onConfirm={async () => { try { await api.post(`/payments/allocations/${a.id}/reverse`); toast.success('Bekor qilindi'); refresh(); } catch (e) { handleApiError(e); } }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!p.allocations.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Taqsimlanmagan</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="refunds">
          <div className="grid gap-2">
            {p.refunds.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm">
                <div>
                  <div className="flex items-center gap-2"><Money minor={f.amountMinor} currency={p.currency} className="font-medium" /><StatusBadge status={f.status} /></div>
                  <div className="text-muted-foreground">{f.reason}</div>
                  <div className="text-xs text-muted-foreground">So'radi: {f.requestedBy} · {dateTime(f.createdAt)}{f.approvedBy ? ` · tasdiqladi: ${f.approvedBy}` : ''}{f.completedAt ? ` · qaytarildi ${dateTime(f.completedAt)}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  {f.status === 'REQUESTED' && can('refunds:approve') && (
                    <>
                      <Button size="sm" onClick={() => post.mutate({ path: `/payments/refunds/${f.id}/decide`, body: { approve: true }, ok: 'Refund tasdiqlandi' })}>Tasdiqlash</Button>
                      <Button size="sm" variant="outline" onClick={() => post.mutate({ path: `/payments/refunds/${f.id}/decide`, body: { approve: false }, ok: 'Refund rad etildi' })}>Rad etish</Button>
                    </>
                  )}
                  {f.status === 'APPROVED' && can('payments:record') && (
                    <>
                      <Confirm title="Pul mijozga qaytarildimi?" description="Buxgalteriyada kassa/bankdan chiqim yoziladi." confirmText="Ha, qaytarildi"
                        trigger={<Button size="sm">Qaytarildi</Button>}
                        onConfirm={async () => { try { await api.post(`/payments/refunds/${f.id}/complete`, { succeeded: true }); toast.success('Belgilandi'); refresh(); } catch (e) { handleApiError(e); } }} />
                      <Button size="sm" variant="outline" onClick={() => post.mutate({ path: `/payments/refunds/${f.id}/complete`, body: { succeeded: false }, ok: 'Refund bekor qilindi' })}>Bekor</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!p.refunds.length && <p className="text-sm text-muted-foreground">Refund yo'q</p>}
          </div>
        </TabsContent>
        <TabsContent value="info">
          <Card className="max-w-2xl"><CardContent className="grid gap-2 pt-6 text-sm">
            <div><span className="text-muted-foreground">Kiritgan:</span> {p.createdBy ?? '—'}</div>
            <div><span className="text-muted-foreground">Tasdiqlagan:</span> {p.approvedBy ?? '—'}</div>
            {p.notes && <div className="whitespace-pre-wrap"><span className="text-muted-foreground">Izoh:</span> {p.notes}</div>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="payment" resourceId={p.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
