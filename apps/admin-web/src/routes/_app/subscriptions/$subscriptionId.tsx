import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, CalendarClock, PauseCircle, Pencil, PlayCircle, Receipt, XCircle } from 'lucide-react';
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
import { date, dateTime, periodRange } from '@/lib/format';
import { CHANGE_LABELS, INTERVAL_LABELS, KIND_LABELS, MONEY_KEYS, subscriptionQuery } from '@/features/billing/api';
import { ReasonDialog } from '@/features/billing/money-dialogs';
import { SubscriptionChangeDialog } from '@/features/billing/subscription-forms';
import { ResourceHistory } from '@/features/common-audit';
import { clientProjectsQuery } from '@/features/projects/api';

export const Route = createFileRoute('/_app/subscriptions/$subscriptionId')({ component: SubscriptionPage });

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-xl">{children}</CardTitle></CardHeader>
      {hint && <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function SubscriptionPage() {
  const { subscriptionId } = Route.useParams();
  const { data: s, isLoading } = useQuery(subscriptionQuery(subscriptionId));
  const links = useQuery({ ...clientProjectsQuery({ clientId: s?.client.id }), enabled: !!s });
  const can = useCan();
  const qc = useQueryClient();
  const refresh = () => { for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: k }); };
  const act = useMutation({
    mutationFn: (p: { path: string; body?: unknown; ok: string }) => api.post(`/subscriptions/${subscriptionId}/${p.path}`, p.body ?? {}).then(() => p.ok),
    onSuccess: (ok) => { toast.success(ok); refresh(); },
    onError: (e) => handleApiError(e),
  });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!s) return null;
  const projectId = links.data?.find((l) => l.id === s.clientProjectId)?.projectId;
  const current = s.revisions.find((r) => !r.validTo) ?? s.revisions[0];
  const live = ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(s.status);
  return (
    <>
      <Link to="/subscriptions" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Obunalar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{s.code}<StatusBadge status={s.status} />{s.cancelAtPeriodEnd && <Badge variant="outline">{date(s.nextBillingOn)} da tugaydi</Badge>}</span>}
        description={<span><Link to="/clients/$clientId" params={{ clientId: s.client.id }} className="hover:underline">{s.client.name}</Link> · {s.project.name} · {s.currency}</span>}
        actions={
          <>
            {live && can('subscriptions:update') && projectId && <SubscriptionChangeDialog sub={s} projectId={projectId} trigger={<Button variant="outline"><Pencil className="mr-2 size-4" />O'zgartirish</Button>} />}
            {live && can('invoices:issue') && (
              <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ path: 'bill', ok: 'Hisob-kitob bajarildi' })}><Receipt className="mr-2 size-4" />Hozir hisoblash</Button>
            )}
            {s.status === 'PAST_DUE' && can('subscriptions:suspend') && (
              <ReasonDialog title="Obunani to'xtatish" description="Imtiyozli muddatni kutmasdan to'xtatiladi. Qarz to'langach avtomatik tiklanadi." destructive confirmText="To'xtatish"
                trigger={<Button variant="outline"><PauseCircle className="mr-2 size-4" />To'xtatish</Button>}
                onSubmit={(p) => api.post(`/subscriptions/${s.id}/suspend`, { reason: p.reason, rowVersion: s.rowVersion }).then(() => toast.success("To'xtatildi"))} />
            )}
            {s.cancelAtPeriodEnd && can('subscriptions:cancel') && (
              <Button variant="outline" onClick={() => act.mutate({ path: 'resume', body: { rowVersion: s.rowVersion }, ok: 'Bekor qilish qaytarib olindi' })}><PlayCircle className="mr-2 size-4" />Davom ettirish</Button>
            )}
            {!['CANCELLED', 'EXPIRED'].includes(s.status) && !s.cancelAtPeriodEnd && can('subscriptions:cancel') && (
              <>
                {s.status !== 'SUSPENDED' && (
                  <ReasonDialog title="Davr oxirida bekor qilish" description={`Obuna ${date(s.nextBillingOn)} da tugaydi, yangi invoice chiqmaydi.`} confirmText="Rejalashtirish"
                    trigger={<Button variant="outline"><CalendarClock className="mr-2 size-4" />Davr oxirida tugatish</Button>}
                    onSubmit={(p) => api.post(`/subscriptions/${s.id}/cancel`, { atPeriodEnd: true, reason: p.reason, rowVersion: s.rowVersion }).then(() => toast.success('Rejalashtirildi'))} />
                )}
                <ReasonDialog title="Darhol bekor qilish" description="Obuna hozir tugaydi. Pul avtomatik qaytarilmaydi (kerak bo'lsa credit note)." destructive confirmText="Bekor qilish"
                  trigger={<Button variant="destructive"><XCircle className="mr-2 size-4" />Bekor qilish</Button>}
                  onSubmit={(p) => api.post(`/subscriptions/${s.id}/cancel`, { atPeriodEnd: false, reason: p.reason, rowVersion: s.rowVersion }).then(() => toast.success('Bekor qilindi'))} />
              </>
            )}
          </>
        }
      />
      {s.pendingChange && (
        <Alert className="mb-4">
          <CalendarClock className="size-4" />
          <AlertTitle>Rejalashtirilgan o'zgarish: {date(s.pendingChange.effectiveOn)} dan</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{CHANGE_LABELS[s.pendingChange.changeType]}{s.pendingChange.reason ? ` — ${s.pendingChange.reason}` : ''}</span>
            {can('subscriptions:update') && (
              <Confirm title="Rejalashtirilgan o'zgarishni bekor qilish" trigger={<Button size="sm" variant="outline">Bekor qilish</Button>}
                onConfirm={async () => { await api.post(`/subscriptions/${s.id}/cancel-change`).catch(handleApiError); refresh(); }} />
            )}
          </AlertDescription>
        </Alert>
      )}
      {s.status === 'PAST_DUE' && <Alert variant="destructive" className="mb-4"><AlertTitle>To'lov kechikmoqda</AlertTitle><AlertDescription>{date(s.pastDueSince)} dan beri. {s.graceDays} kunlik imtiyozdan keyin obuna to'xtatiladi.</AlertDescription></Alert>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Oylik MRR"><Money minor={s.mrrMinor} currency={s.currency} /></Stat>
        <Stat label="Joriy davr" hint={s.trialEndsOn && s.status === 'TRIALING' ? `Sinov ${date(s.trialEndsOn)} gacha` : undefined}>
          <span className="text-base">{periodRange(s.currentPeriodStart, s.currentPeriodEnd)}</span>
        </Stat>
        <Stat label="Keyingi hisob">{date(s.nextBillingOn)}</Stat>
        <Stat label="Shartlar" hint={`Imtiyozli muddat: ${s.graceDays} kun`}><span className="text-base">{s.paymentTermsDays} kun ichida to'lov</span></Stat>
      </div>
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Tarkib</TabsTrigger>
          <TabsTrigger value="invoices">Invoice'lar ({s.invoices.length})</TabsTrigger>
          <TabsTrigger value="revisions">Revision'lar ({s.revisions.length})</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Tarif</TableHead><TableHead className="text-right">Miqdor</TableHead><TableHead className="text-right">Narx</TableHead><TableHead className="text-right">Chegirma</TableHead><TableHead>Davr</TableHead></TableRow></TableHeader>
              <TableBody>
                {current?.items.map((i) => (
                  <TableRow key={i.planPriceId}>
                    <TableCell className="font-medium">{i.planName}</TableCell>
                    <TableCell className="text-right">{i.quantity}</TableCell>
                    <TableCell className="text-right"><Money minor={i.unitAmountMinor} currency={s.currency} /></TableCell>
                    <TableCell className="text-right">{i.discountBp ? `${i.discountBp / 100}%` : '—'}</TableCell>
                    <TableCell>{INTERVAL_LABELS[i.intervalMonths]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="invoices">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Raqam</TableHead><TableHead>Davr</TableHead><TableHead>Holat</TableHead><TableHead className="text-right">Summa</TableHead><TableHead className="text-right">Qoldiq</TableHead></TableRow></TableHeader>
              <TableBody>
                {s.invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell><Link to="/invoices/$invoiceId" params={{ invoiceId: i.id }} className="font-mono text-xs font-medium hover:underline">{i.number}</Link><div className="text-xs text-muted-foreground">{KIND_LABELS[i.kind]}</div></TableCell>
                    <TableCell className="text-sm">{periodRange(i.periodStart, i.periodEnd)}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="text-right"><Money minor={i.totalMinor} currency={i.currency} /></TableCell>
                    <TableCell className="text-right">{i.outstandingMinor === '0' ? '—' : <Money minor={i.outstandingMinor} currency={i.currency} />}</TableCell>
                  </TableRow>
                ))}
                {!s.invoices.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Hali invoice chiqmagan</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="revisions">
          <ol className="relative grid gap-4 border-l pl-5">
            {s.revisions.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border bg-background" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">#{r.revisionNo}</Badge><span className="font-medium">{CHANGE_LABELS[r.changeType] ?? r.changeType}</span><StatusBadge status={r.status} />
                  <span className="text-muted-foreground">MRR <Money minor={r.mrrMinor} currency={s.currency} /></span>
                </div>
                <div className="text-xs text-muted-foreground">{dateTime(r.validFrom)} — {r.validTo ? dateTime(r.validTo) : 'hozir'}{r.reason ? ` · ${r.reason}` : ''}</div>
                <div className="text-xs text-muted-foreground">{r.items.map((i) => `${i.planName} × ${i.quantity}${i.discountBp ? ` (−${i.discountBp / 100}%)` : ''}`).join(', ')}</div>
              </li>
            ))}
          </ol>
        </TabsContent>
        <TabsContent value="history"><Card><CardContent className="pt-6"><ResourceHistory resourceType="subscription" resourceId={s.id} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
