import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Cpu, MessageSquare, PauseCircle, Receipt, Repeat, Wallet } from 'lucide-react';
import type { PortalDashboard } from '@ads/contracts';
import { BillingChart } from '@/components/common/billing-chart';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { PayInstructions } from '@/components/common/pay-instructions';
import { PayInvoicesButton } from '@/components/pay/pay-invoices-button';
import { Stat } from '@/components/common/stat';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { date, daysUntil } from '@/lib/format';
import { meQuery, PAYMENT_METHODS, useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/')({ component: Home });

const MoneyList = ({ items }: { items: { currency: string; amountMinor: string }[] }) =>
  items.length ? <span className="flex flex-col">{items.map((x) => <Money key={x.currency} minor={x.amountMinor} currency={x.currency} />)}</span> : <span>—</span>;

function StatusBanner({ d, pay }: { d: PortalDashboard; pay: boolean }) {
  const f = d.finance;
  const payAll = pay && f?.openInvoices.length ? <div className="mt-2"><PayInvoicesButton size="sm" invoices={f.openInvoices} label={f.openInvoices.length > 1 ? `Hammasini onlayn to'lash` : "Onlayn to'lash"} /></div> : null;
  const due = f?.balances.filter((b) => b.receivableMinor !== '0') ?? [];
  const overdue = f?.balances.filter((b) => b.overdueMinor !== '0') ?? [];
  const nearest = f?.openInvoices[0];
  if (d.status === 'SUSPENDED') {
    return (
      <Alert variant="destructive">
        <PauseCircle className="size-4" />
        <AlertTitle>Ba'zi xizmatlar to'xtatilgan</AlertTitle>
        <AlertDescription>
          To'lov muddati o'tgani sababli xizmat vaqtincha to'xtatilgan. Qarz to'langach, xizmat avtomatik tiklanadi.
          {f && overdue.length > 0 && <span className="mt-1 block font-medium">Muddati o'tgan: {overdue.map((b) => <Money key={b.currency} minor={b.overdueMinor} currency={b.currency} className="mr-2" />)}</span>}
          {payAll}
        </AlertDescription>
      </Alert>
    );
  }
  if (d.status === 'OVERDUE') {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>To'lov muddati o'tgan</AlertTitle>
        <AlertDescription>
          <span>Muddati o'tgan qarz: {overdue.map((b) => <Money key={b.currency} minor={b.overdueMinor} currency={b.currency} className="mr-2 font-semibold" />)}. Iltimos, xizmat to'xtatilmasligi uchun to'lovni amalga oshiring.</span>
          {payAll}
        </AlertDescription>
      </Alert>
    );
  }
  if (d.status === 'DUE') {
    return (
      <Alert>
        <CircleAlert className="size-4" />
        <AlertTitle>To'lov kutilmoqda</AlertTitle>
        <AlertDescription>
          <span>To'lanishi kerak: {due.map((b) => <Money key={b.currency} minor={b.receivableMinor} currency={b.currency} className="mr-2 font-semibold" />)}{nearest?.dueDate && <> · eng yaqin muddat {date(nearest.dueDate)}</>}</span>
          {payAll}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="border-success/40">
      <CheckCircle2 className="size-4 text-success" />
      <AlertTitle>Hammasi joyida</AlertTitle>
      <AlertDescription>{d.finance ? "To'lanmagan hisob-fakturalar yo'q. Rahmat!" : 'Barcha xizmatlar faol.'}</AlertDescription>
    </Alert>
  );
}

function Home() {
  const { data: me } = useQuery(meQuery);
  const access = useAccess();
  const { data: d, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<PortalDashboard>('/dashboard'), refetchInterval: 120_000 });
  const f = d?.finance;
  const mainCurrency = f?.history.find((h) => h.invoicedMinor !== '0')?.currency ?? me?.client.billingCurrency ?? 'UZS';
  const receivable = f?.balances.filter((b) => b.receivableMinor !== '0') ?? [];
  const credit = f?.balances.filter((b) => b.creditMinor !== '0') ?? [];
  const nextIn = daysUntil(f?.nextCharge?.date);
  return (
    <>
      <PageHeader
        title={`Assalomu alaykum, ${me?.user.fullName.split(' ')[0] ?? ''}!`}
        description={me ? <>{me.client.legalName} · shaxsiy hisob raqami <span className="font-mono">{me.client.accountNo}</span></> : null}
      />
      {isLoading && <div className="grid gap-4"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>}
      {d && (
        <div className="grid gap-4">
          {d.services.length === 0 ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2"><CardTitle className="text-base">Xush kelibsiz! Kabinetingiz ochildi</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p className="text-muted-foreground">
                  Hozircha ulangan xizmat yo'q. {access.finance ? "«Xizmatlar» bo'limida tarifni o'zingiz tanlab, onlayn to'lab darhol ulanishingiz mumkin. " : ''}Menejerimiz ham siz bilan bog'lanib, ehtiyojingizga mos yechimni taklif qiladi.
                  {d.requests.open > 0 ? " So'rovingiz qabul qilingan — javobni «Murojaatlar» bo'limida ko'rasiz." : " Qanday xizmat kerakligini yozib qoldirsangiz, jarayon tezlashadi."}
                </p>
                {(access.writeRequests || access.finance) && (
                  <div className="flex flex-wrap gap-2">
                    {access.finance && <Button asChild size="sm"><Link to="/services">Xizmatlar va tariflar</Link></Button>}
                    {!access.writeRequests ? null : d.requests.open > 0
                      ? <Button asChild size="sm" variant="outline"><Link to="/requests">Murojaatlarim</Link></Button>
                      : <Button asChild size="sm" variant={access.finance ? 'outline' : 'default'}><Link to="/requests/new" search={{ category: 'CHANGE' }}>Xizmatga ulanish so'rovi</Link></Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : <StatusBanner d={d} pay={access.pay} />}

          {f ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat icon={Wallet} label="To'lanishi kerak" tone={receivable.some((b) => b.overdueMinor !== '0') ? 'danger' : undefined}
                value={receivable.length ? <MoneyList items={receivable.map((b) => ({ currency: b.currency, amountMinor: b.receivableMinor }))} /> : <Money minor="0" currency={mainCurrency} />}
                hint={receivable.length ? `${receivable.reduce((a, b) => a + b.openInvoices, 0)} ta to'lanmagan invoice` : 'Qarz yo\'q'} />
              <Stat icon={CalendarClock} label="Keyingi hisob" value={f.nextCharge ? date(f.nextCharge.date) : '—'}
                hint={f.nextCharge ? <span>taxminan {f.nextCharge.amounts.map((a, k) => <Money key={a.currency} minor={a.amountMinor} currency={a.currency} className={k ? 'ml-1' : undefined} />)}{nextIn !== null && nextIn >= 0 && ` · ${nextIn === 0 ? 'bugun' : `${nextIn} kundan keyin`}`}</span> : "Rejalashtirilgan hisob yo'q"} />
              <Stat icon={Repeat} label="Oylik to'lov" value={<MoneyList items={f.monthly} />} hint={`${d.services.filter((s) => s.status !== 'SUSPENDED').length} ta faol xizmat bo'yicha`} />
              {credit.length ? (
                <Stat icon={Receipt} label="Avans (oldindan to'lov)" value={<MoneyList items={credit.map((b) => ({ currency: b.currency, amountMinor: b.creditMinor }))} />} hint="Keyingi invoice'larga avtomatik o'tkaziladi" />
              ) : (
                <Stat icon={Receipt} label="Oxirgi to'lov" value={f.recentPayments[0] ? <Money minor={f.recentPayments[0].amountMinor} currency={f.recentPayments[0].currency} /> : '—'}
                  hint={f.recentPayments[0] ? `${date(f.recentPayments[0].receivedAt)} · ${PAYMENT_METHODS[f.recentPayments[0].method] ?? f.recentPayments[0].method}` : "To'lovlar hali yo'q"} />
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat icon={Repeat} label="Faol xizmatlar" value={d.services.filter((s) => s.status !== 'SUSPENDED').length} />
              <Stat icon={Cpu} label="Qurilmalar" value={d.devices.total} hint={d.devices.updatesAvailable ? `${d.devices.updatesAvailable} ta dasturga yangi versiya mavjud` : 'Hammasi oxirgi versiyada'} />
              <Stat icon={MessageSquare} label="Ochiq murojaatlar" value={d.requests.open} hint={d.requests.unread ? `${d.requests.unread} ta yangi javob` : undefined} />
            </div>
          )}

          {f && (
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader className="pb-2"><CardTitle className="text-base">Hisob-kitoblar (so'nggi 12 oy)</CardTitle></CardHeader>
                <CardContent><BillingChart history={f.history} currency={mainCurrency} /></CardContent>
              </Card>
              <div className="lg:col-span-2">
                {receivable.length ? <PayInstructions compact invoiceNumber={f.openInvoices.length === 1 ? f.openInvoices[0]!.number : null} /> : (
                  <Card className="h-full">
                    <CardHeader className="pb-2"><CardTitle className="text-base">So'nggi to'lovlar</CardTitle></CardHeader>
                    <CardContent className="grid gap-2 text-sm">
                      {f.recentPayments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2">
                          <span><span className="font-mono text-xs">{p.code}</span><span className="block text-xs text-muted-foreground">{date(p.receivedAt)} · {PAYMENT_METHODS[p.method] ?? p.method}</span></span>
                          <Money minor={p.amountMinor} currency={p.currency} className="font-medium" />
                        </div>
                      ))}
                      {!f.recentPayments.length && <p className="text-muted-foreground">To'lovlar hali yo'q</p>}
                      <Link to="/payments" className="mt-1 inline-flex items-center text-xs text-primary hover:underline">Barcha to'lovlar<ArrowRight className="ml-1 size-3" /></Link>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          <div className={cn('grid gap-4', f ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-base">Xizmatlaringiz</CardTitle><Link to="/subscriptions" className="text-xs text-primary hover:underline">Batafsil</Link></CardHeader>
              <CardContent className="grid gap-2">
                {d.services.map((s) => (
                  <Link key={s.id} to="/subscriptions/$subscriptionId" params={{ subscriptionId: s.id }} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm hover:border-primary/50">
                    <span className="min-w-0">
                      <span className="block font-medium">{s.projectName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.status === 'TRIALING' && s.trialEndsOn ? `sinov ${date(s.trialEndsOn)} gacha` : s.nextBillingOn ? `keyingi hisob ${date(s.nextBillingOn)}` : s.code}
                        {s.pendingChangeOn && ` · ${date(s.pendingChangeOn)} dan o'zgarish`}{s.cancelAtPeriodEnd && ' · davr oxirida tugaydi'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">{s.mrrMinor && <Money minor={s.mrrMinor} currency={s.currency} className="text-xs text-muted-foreground" />}<StatusBadge status={s.status} /></span>
                  </Link>
                ))}
                {!d.services.length && <p className="py-4 text-sm text-muted-foreground">Faol xizmatlar yo'q</p>}
              </CardContent>
            </Card>

            {f ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-base">To'lanmagan invoice'lar</CardTitle><Link to="/invoices" className="text-xs text-primary hover:underline">Hammasi</Link></CardHeader>
                <CardContent className="grid gap-2">
                  {f.openInvoices.map((i) => (
                    <Link key={i.id} to="/invoices/$invoiceId" params={{ invoiceId: i.id }} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm hover:border-primary/50', i.overdueDays > 0 && 'border-destructive/40')}>
                      <span><span className="font-mono font-medium">{i.number}</span><span className="block text-xs text-muted-foreground">muddat {date(i.dueDate)}</span></span>
                      <span className="flex items-center gap-2">{i.overdueDays > 0 && <Badge variant="destructive">{i.overdueDays} kun kechikdi</Badge>}<Money minor={i.outstandingMinor} currency={i.currency} className="font-semibold" /></span>
                    </Link>
                  ))}
                  {!f.openInvoices.length && <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" />Hammasi to'langan</p>}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-base">Qurilmalar va murojaatlar</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <Link to="/devices" className="flex items-center justify-between rounded-md border bg-card p-3 hover:border-primary/50">
                  <span className="flex items-center gap-2"><Cpu className="size-4 text-muted-foreground" />{d.devices.total} ta qurilma</span>
                  {d.devices.updatesAvailable > 0 ? <Badge variant="outline" className="border-primary/40 text-primary">{d.devices.updatesAvailable} ta yangilanish</Badge> : <span className="text-xs text-muted-foreground">oxirgi versiyalarda</span>}
                </Link>
                <Link to="/requests" className="flex items-center justify-between rounded-md border bg-card p-3 hover:border-primary/50">
                  <span className="flex items-center gap-2"><MessageSquare className="size-4 text-muted-foreground" />{d.requests.open} ta ochiq murojaat</span>
                  {d.requests.unread > 0 ? <Badge variant="destructive">{d.requests.unread} ta yangi javob</Badge> : <span className="text-xs text-muted-foreground">yangi javob yo'q</span>}
                </Link>
                {access.writeRequests && <Button asChild variant="outline" size="sm" className="mt-1 justify-self-start"><Link to="/requests/new">Yangi murojaat yuborish</Link></Button>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
