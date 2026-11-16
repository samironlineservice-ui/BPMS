import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, CalendarClock, Clock, Cpu, History, MessageSquarePlus, Receipt, Repeat, Sparkles } from 'lucide-react';
import type { PortalSubscriptionDetail } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { Stat } from '@/components/common/stat';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { date, periodRange } from '@/lib/format';
import { CHANGE_LABELS, useAccess } from '@/lib/session';

export const Route = createFileRoute('/_app/subscriptions/$subscriptionId')({ component: SubscriptionPage });

function SubscriptionPage() {
  const { subscriptionId } = Route.useParams();
  const access = useAccess();
  const { data: s, isLoading } = useQuery({ queryKey: ['subscriptions', subscriptionId], queryFn: () => api.get<PortalSubscriptionDetail>(`/subscriptions/${subscriptionId}`) });
  if (isLoading) return <Skeleton className="h-64" />;
  if (!s) return null;
  const money = s.mrrMinor !== null;
  return (
    <>
      <Link to="/subscriptions" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Obunalar</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{s.projectName}<StatusBadge status={s.status} />{s.cancelAtPeriodEnd && <Badge variant="outline">davr oxirida tugaydi</Badge>}</span>}
        description={<><span className="font-mono">{s.code}</span>{s.startedOn && <> · {date(s.startedOn)} dan beri</>}</>}
        actions={access.writeRequests && (
          <Button asChild variant="outline"><Link to="/requests/new" search={{ category: 'CHANGE', subscriptionId: s.id }}><MessageSquarePlus className="mr-2 size-4" />O'zgartirish so'rash</Link></Button>
        )}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {money && <Stat icon={Repeat} label="Oylik to'lov" value={<Money minor={s.mrrMinor} currency={s.currency} />} />}
        <Stat icon={Clock} label="Joriy davr" value={<span className="text-base">{periodRange(s.currentPeriodStart, s.currentPeriodEnd)}</span>} />
        <Stat icon={CalendarClock} label="Keyingi hisob" value={<span className="text-base">{date(s.nextBillingOn)}</span>} hint={`To'lov muddati — hisobdan keyin ${s.paymentTermsDays} kun`} />
        {s.trialEndsOn && <Stat icon={Sparkles} label="Sinov muddati" value={<span className="text-base">{date(s.trialEndsOn)} gacha</span>} />}
      </div>

      <div className="mb-4 grid gap-3">
        {s.status === 'SUSPENDED' && (
          <Alert variant="destructive"><AlertTitle>Xizmat vaqtincha to'xtatilgan</AlertTitle><AlertDescription>To'lov muddati o'tgani sababli. Qarz to'langach, xizmat avtomatik tiklanadi.</AlertDescription></Alert>
        )}
        {s.status === 'PAST_DUE' && (
          <Alert variant="destructive"><AlertTitle>To'lov kechikmoqda</AlertTitle><AlertDescription>Imtiyozli muddat tugagach, xizmat to'xtatilishi mumkin. Iltimos, to'lovni amalga oshiring.</AlertDescription></Alert>
        )}
        {s.pendingChange && (
          <Alert>
            <CalendarClock className="size-4" />
            <AlertTitle>{date(s.pendingChange.effectiveOn)} dan tarif o'zgaradi</AlertTitle>
            <AlertDescription>
              <span className="grid gap-0.5">
                {s.pendingChange.items.map((i, k) => (
                  <span key={k}>{i.planName} × {i.quantity}{i.unitAmountMinor && <> — <Money minor={i.unitAmountMinor} currency={s.currency} /></>}{i.discountBp ? ` (−${i.discountBp / 100}%)` : ''}</span>
                ))}
                {s.pendingChange.mrrMinor && <span className="font-medium">Yangi oylik to'lov: <Money minor={s.pendingChange.mrrMinor} currency={s.currency} /></span>}
              </span>
            </AlertDescription>
          </Alert>
        )}
        {s.cancelAtPeriodEnd && <Alert><AlertTitle>Obuna joriy davr oxirida tugaydi</AlertTitle><AlertDescription>Davom ettirmoqchi bo'lsangiz, murojaat yuboring.</AlertDescription></Alert>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 overflow-hidden p-0">
          <CardHeader className="py-4"><CardTitle className="text-base">Tarif tarkibi</CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Tarif</TableHead><TableHead className="text-right">Miqdor</TableHead>{money && <TableHead className="text-right">Narx</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {s.items.map((i, k) => (
                <TableRow key={k}>
                  <TableCell>{i.planName}{i.discountBp ? <Badge variant="outline" className="ml-2">−{i.discountBp / 100}%</Badge> : null}</TableCell>
                  <TableCell className="text-right">{i.quantity}</TableCell>
                  {money && <TableCell className="text-right"><Money minor={i.unitAmountMinor} currency={s.currency} />{i.intervalMonths > 1 && <span className="text-xs text-muted-foreground"> / {i.intervalMonths} oy</span>}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><History className="size-4 text-muted-foreground" />O'zgarishlar tarixi</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative grid gap-3 border-l pl-4">
              {s.history.map((h, k) => (
                <li key={k} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{CHANGE_LABELS[h.changeType] ?? h.changeType}</span>
                    <StatusBadge status={h.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">{date(h.date)}{h.mrrMinor && <> · oylik <Money minor={h.mrrMinor} currency={s.currency} /></>}</div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Cpu className="size-4 text-muted-foreground" />Qurilmalarda o'rnatilgan</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {s.installations.map((i, k) => (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5">
                <span><span className="font-medium">{i.deviceName}</span><span className="block text-xs text-muted-foreground">{i.componentName}{i.siteName ? ` · ${i.siteName}` : ''}</span></span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs">{i.currentVersion ?? '—'}</span>
                  {i.updateAvailable && <Badge variant="outline" className="border-primary/40 text-primary">yangi: {i.latestVersion}</Badge>}
                </span>
              </div>
            ))}
            {!s.installations.length && <p className="text-muted-foreground">Qurilmalarda o'rnatmalar qayd etilmagan</p>}
          </CardContent>
        </Card>

        {s.invoices && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Receipt className="size-4 text-muted-foreground" />Invoice'lar</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              {s.invoices.slice(0, 12).map((i) => (
                <Link key={i.id} to="/invoices/$invoiceId" params={{ invoiceId: i.id }} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                  <span><span className="font-mono text-xs font-medium">{i.number}</span><span className="ml-2 text-xs text-muted-foreground">{date(i.issueDate)}</span></span>
                  <span className="flex items-center gap-2"><Money minor={i.totalMinor} currency={i.currency} /><StatusBadge status={i.status} label={i.status === 'OPEN' && i.paidMinor !== '0' ? "Qisman to'langan" : undefined} /></span>
                </Link>
              ))}
              {!s.invoices.length && <p className="text-muted-foreground">Hali invoice yo'q</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
