import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, FileDown, FileMinus, Hourglass, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Confirm } from '@/components/common/confirm';
import { DetailList } from '@/components/common/detail-list';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { date, dateTime, money } from '@/lib/format';
import { invoiceQuery, KIND_LABELS, minorToInput, MONEY_KEYS } from '@/features/billing/api';
import { PaymentDialog, ReasonDialog, requestCreditNote, requestVoid } from '@/features/billing/money-dialogs';
import { ResourceHistory } from '@/features/common-audit';

export const Route = createFileRoute('/_app/invoices/$invoiceId')({ component: InvoicePage });

const POLICY_LABELS: Record<string, string> = { credit_notes: 'Credit note', 'invoices.void': 'Bekor qilish (void)' };

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const { data: inv, isLoading } = useQuery(invoiceQuery(invoiceId));
  const can = useCan();
  const qc = useQueryClient();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!inv) return null;
  const refresh = () => { for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: k }); };
  const open = inv.status === 'OPEN' || inv.status === 'UNCOLLECTIBLE';
  const pending = inv.approvals.filter((a) => a.status === 'PENDING');
  const partial = inv.status === 'OPEN' && inv.paidMinor !== '0';
  const snap = (inv.clientSnapshot ?? {}) as Record<string, string | null>;
  return (
    <>
      <Link to="/invoices" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Invoice'lar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{inv.number}</span><StatusBadge status={inv.status} label={partial ? "Qisman to'langan" : undefined} />{inv.overdueDays > 0 && <Badge variant="destructive">{inv.overdueDays} kun kechikdi</Badge>}</span>}
        description={
          <span>
            <Link to="/clients/$clientId" params={{ clientId: inv.client.id }} className="hover:underline">{inv.client.name}</Link>
            {' · '}{KIND_LABELS[inv.kind]}
            {inv.subscriptionId && <> · <Link to="/subscriptions/$subscriptionId" params={{ subscriptionId: inv.subscriptionId }} className="hover:underline">{inv.subscriptionCode}</Link></>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild><a href={`/api/v1/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="mr-2 size-4" />PDF</a></Button>
            {open && can('payments:record') && (
              <PaymentDialog clientId={inv.client.id} clientName={inv.client.name} currency={inv.currency} amount={minorToInput(inv.outstandingMinor)}
                trigger={<Button><Wallet className="mr-2 size-4" />To'lov kiritish</Button>} />
            )}
            {open && can('credit_notes:request') && !pending.some((p) => p.policyKey === 'credit_notes') && (
              <ReasonDialog title="Credit note" description="Invoice qarzini kamaytiradi (chegirma, xizmat uzilishi va h.k.). Rahbar tasdiqlaydi." withAmount
                amountLabel={`Summa (${inv.currency}, QQS bilan)`} defaultAmount={minorToInput(inv.outstandingMinor)} confirmText="So'rov yuborish"
                trigger={<Button variant="outline"><FileMinus className="mr-2 size-4" />Credit note</Button>} onSubmit={requestCreditNote(inv)} />
            )}
            {open && inv.paidMinor === '0' && inv.creditedMinor === '0' && can('invoices:issue') && !pending.some((p) => p.policyKey === 'invoices.void') && (
              <ReasonDialog title="Invoice'ni bekor qilish (void)" description="Raqam saqlanadi, buxgalteriya yozuvi teskari qilinadi. Rahbar tasdiqlaydi." destructive confirmText="So'rov yuborish"
                trigger={<Button variant="outline"><Ban className="mr-2 size-4" />Bekor qilish</Button>} onSubmit={requestVoid(inv)} />
            )}
          </>
        }
      />
      {pending.length > 0 && (
        <Alert className="mb-4"><Hourglass className="size-4" /><AlertTitle>Tasdiq kutilmoqda</AlertTitle>
          <AlertDescription>{pending.map((p) => POLICY_LABELS[p.policyKey] ?? p.policyKey).join(', ')} — rahbar ko'rib chiqadi (Tasdiqlar bo'limi).</AlertDescription></Alert>
      )}
      {inv.status === 'VOID' && <Alert variant="destructive" className="mb-4"><AlertTitle>Bekor qilingan</AlertTitle><AlertDescription>{dateTime(inv.voidedAt)} — {inv.voidReason}</AlertDescription></Alert>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Jami</CardDescription><CardTitle className="text-xl"><Money minor={inv.totalMinor} currency={inv.currency} /></CardTitle></CardHeader>
          {inv.currency === 'USD' && inv.fxRate && <CardContent className="pt-0 text-xs text-muted-foreground">MB kursi {inv.fxRate} · {money(inv.totalUzsMinor, 'UZS')}</CardContent>}</Card>
        <Card><CardHeader className="pb-2"><CardDescription>To'langan</CardDescription><CardTitle className="text-xl"><Money minor={inv.paidMinor} currency={inv.currency} /></CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Credit note</CardDescription><CardTitle className="text-xl"><Money minor={inv.creditedMinor} currency={inv.currency} /></CardTitle></CardHeader></Card>
        <Card className={inv.overdueDays ? 'border-destructive/50' : undefined}><CardHeader className="pb-2"><CardDescription>Qoldiq</CardDescription><CardTitle className="text-xl"><Money minor={inv.outstandingMinor} currency={inv.currency} /></CardTitle></CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">Sana {date(inv.issueDate)} · muddat {date(inv.dueDate)}</CardContent></Card>
      </div>
      <Tabs defaultValue="lines">
        <TabsList className="flex-wrap">
          <TabsTrigger value="lines">Qatorlar</TabsTrigger>
          <TabsTrigger value="payments">To'lovlar ({inv.allocations.length})</TabsTrigger>
          <TabsTrigger value="credits">Credit note ({inv.creditNotes.length})</TabsTrigger>
          <TabsTrigger value="client">Rekvizitlar</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="lines">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead className="w-10">№</TableHead><TableHead>Xizmat</TableHead><TableHead className="text-right">Miqdor</TableHead><TableHead className="text-right">Narx</TableHead><TableHead className="text-right">Summa</TableHead><TableHead className="text-right">QQS</TableHead></TableRow></TableHeader>
              <TableBody>
                {inv.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.position}</TableCell>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{l.quantity}{l.prorationDen > 1 && <span className="text-xs text-muted-foreground"> × {l.prorationNum}/{l.prorationDen}</span>}</TableCell>
                    <TableCell className="text-right"><Money minor={l.unitAmountMinor} currency={inv.currency} /></TableCell>
                    <TableCell className="text-right"><Money minor={l.amountMinor} currency={inv.currency} /></TableCell>
                    <TableCell className="text-right">{l.vatRateBp ? <Money minor={l.vatMinor} currency={inv.currency} /> : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow><TableCell colSpan={4} className="text-right">QQSsiz summa</TableCell><TableCell className="text-right"><Money minor={inv.subtotalMinor} currency={inv.currency} /></TableCell><TableCell className="text-right"><Money minor={inv.vatMinor} currency={inv.currency} /></TableCell></TableRow>
                <TableRow><TableCell colSpan={4} className="text-right font-semibold">Jami</TableCell><TableCell colSpan={2} className="text-right font-semibold"><Money minor={inv.totalMinor} currency={inv.currency} /></TableCell></TableRow>
              </TableFooter>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="payments">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>To'lov</TableHead><TableHead>Sana</TableHead><TableHead className="text-right">To'lovdan</TableHead><TableHead className="text-right">Invoice'ga</TableHead><TableHead className="text-right">Kurs farqi</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {inv.allocations.map((a) => (
                  <TableRow key={a.id} className={a.reversalOfId || a.reversed ? 'text-muted-foreground' : undefined}>
                    <TableCell><Link to="/payments/$paymentId" params={{ paymentId: a.paymentId }} className="font-mono text-xs hover:underline">{a.paymentCode}</Link>{a.reversalOfId && <Badge variant="outline" className="ml-2">bekor qilish</Badge>}{a.reversed && <Badge variant="outline" className="ml-2">bekor qilingan</Badge>}</TableCell>
                    <TableCell className="text-sm">{dateTime(a.appliedAt)}</TableCell>
                    <TableCell className="text-right"><Money minor={a.amountPaymentMinor} currency={a.paymentCurrency} /></TableCell>
                    <TableCell className="text-right"><Money minor={a.amountInvoiceMinor} currency={a.invoiceCurrency} />{a.paymentCurrency !== a.invoiceCurrency && <div className="text-xs text-muted-foreground">@ {a.fxRate}</div>}</TableCell>
                    <TableCell className="text-right">{a.fxDiffUzsMinor === '0' ? '—' : <Money minor={a.fxDiffUzsMinor} currency="UZS" />}</TableCell>
                    <TableCell className="w-12 text-right">
                      {!a.reversalOfId && !a.reversed && can('payments:allocate') && (
                        <Confirm title="Taqsimotni bekor qilish" description="To'lov summasi mijoz kreditiga qaytadi, invoice qoldig'i tiklanadi." destructive
                          trigger={<Button variant="ghost" size="icon" aria-label="Bekor qilish"><Undo2 className="size-4" /></Button>}
                          onConfirm={async () => { try { await api.post(`/payments/allocations/${a.id}/reverse`); toast.success('Bekor qilindi'); refresh(); } catch (e) { handleApiError(e); } }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!inv.allocations.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">To'lov qo'llanmagan</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="credits">
          <div className="grid gap-2">
            {inv.creditNotes.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border bg-card p-3 text-sm">
                <div><div className="font-mono text-xs font-medium">{c.number}</div><div className="text-muted-foreground">{c.reason}</div></div>
                <div className="text-right"><Money minor={c.amountMinor} currency={inv.currency} className="font-medium" /><div className="text-xs text-muted-foreground">{dateTime(c.issuedAt)}</div></div>
              </div>
            ))}
            {!inv.creditNotes.length && <p className="text-sm text-muted-foreground">Credit note yo'q</p>}
          </div>
        </TabsContent>
        <TabsContent value="client">
          <Card className="max-w-2xl"><CardHeader><CardTitle className="text-base">Chiqarilgan paytdagi mijoz rekvizitlari</CardTitle></CardHeader>
            <CardContent><DetailList items={[
              ['Nomi', snap.legalName], ['STIR', snap.tin], ['Manzil', snap.legalAddress], ['Bank', snap.bankName], ['MFO', snap.bankMfo], ['Hisob raqami', snap.bankAccount],
              ['Telefon', snap.phone], ['Billing email', snap.billingEmail], ['Shaxsiy hisob raqami', snap.accountNo],
            ]} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="invoice" resourceId={inv.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
