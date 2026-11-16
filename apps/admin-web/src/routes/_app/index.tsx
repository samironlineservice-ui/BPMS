import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCheck, Rocket, Server, Users } from 'lucide-react';
import type { DashboardDto } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { date } from '@/lib/format';
import { CashChart, MrrChart, sinceFirstActivity } from '@/features/analytics/charts';
import { CLASS_LABELS } from '@/features/devices/api';

export const Route = createFileRoute('/_app/')({ component: Dashboard });

function Tile({ label, children, hint, to, tone }: {
  label: string; children: React.ReactNode; hint?: React.ReactNode; to?: '/subscriptions' | '/invoices' | '/payments' | '/approvals'; tone?: 'danger' | 'warn';
}) {
  const body = (
    <Card className={`h-full transition-colors ${to ? 'hover:border-primary/50' : ''} ${tone === 'danger' ? 'border-destructive/40' : tone === 'warn' ? 'border-warning/50' : ''}`}>
      <CardHeader className="pb-1"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{children}</CardTitle></CardHeader>
      {hint && <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function Delta({ cur, prev }: { cur: string; prev: string }) {
  const c = Number(cur); const p = Number(prev);
  if (!p) return <span>o'tgan oy: 0</span>;
  const pct = Math.round(((c - p) / p) * 100);
  return <span className={`inline-flex items-center gap-0.5 ${pct >= 0 ? 'text-success' : 'text-destructive'}`}>{pct >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(pct)}% o'tgan oyga nisbatan</span>;
}

function Dashboard() {
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardDto>('/dashboard'), refetchInterval: 60_000 });
  const f = data?.finance;
  const hello = me?.user.fullName?.split(' ')[0] ?? '';
  return (
    <>
      <PageHeader title={`Xush kelibsiz${hello ? `, ${hello}` : ''}`} description={data ? `${date(data.asOf)} holatiga${data.usdRate ? ` · MB kursi: 1 USD = ${data.usdRate.replace(/\.?0+$/, '')} so'm` : ''}` : 'Yuklanmoqda…'} />
      {isLoading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {data && (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {f && (
              <>
                <Tile label="Oylik takroriy daromad (MRR)" to="/subscriptions" hint={<>{f.mrr.map((m) => <span key={m.currency} className="mr-2"><Money minor={m.amountMinor} currency={m.currency} /></span>)}{f.subscriptions.active} faol obuna</>}>
                  <Money minor={f.mrrUzsMinor} currency="UZS" />
                </Tile>
                <Tile label="Debitorlik (qarzdorlik)" to="/invoices" tone={f.overdueUzsMinor !== '0' ? 'danger' : undefined}
                  hint={f.overdueUzsMinor !== '0' ? <span className="font-medium text-destructive">Muddati o'tgan: <Money minor={f.overdueUzsMinor} currency="UZS" /></span> : "Muddati o'tgan qarz yo'q"}>
                  <Money minor={f.receivableUzsMinor} currency="UZS" />
                </Tile>
                <Tile label="Bu oy tushum" to="/payments" hint={<Delta cur={f.collectedThisMonthUzsMinor} prev={f.collectedPrevMonthUzsMinor} />}>
                  <Money minor={f.collectedThisMonthUzsMinor} currency="UZS" />
                </Tile>
              </>
            )}
            <Tile label="Tasdiq kutilmoqda" to="/approvals" tone={data.approvalsPending ? 'warn' : undefined}
              hint={data.approvalsPending ? "To'lovlar, refund, credit note, deployment" : 'Hammasi ko\'rib chiqilgan'}>
              <span className="flex items-center gap-2">{data.approvalsPending}{!data.approvalsPending && <CheckCheck className="size-5 text-success" />}</span>
            </Tile>
          </div>
          {f && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">MRR dinamikasi (so'mda)</CardTitle><CardDescription>Oy oxiridagi oylik takroriy daromad · USD joriy kursda</CardDescription></CardHeader>
                <CardContent><MrrChart data={sinceFirstActivity(f.trend)} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Hisoblangan va tushum</CardTitle><CardDescription>Oylar kesimida, so'mda</CardDescription></CardHeader>
                <CardContent><CashChart data={sinceFirstActivity(f.trend)} /></CardContent>
              </Card>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            {f && (
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-destructive" />Muddati o'tgan invoice'lar</CardTitle>
                    <CardDescription>Obunalar: {f.subscriptions.pastDue} kechikkan · {f.subscriptions.suspended} to'xtatilgan · {f.upcomingBilling} tasi 7 kunda hisoblanadi</CardDescription></div>
                  <Link to="/invoices" search={{ overdue: 'true' }} className="text-sm text-primary hover:underline">Barchasi →</Link>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {f.topOverdue.map((i) => (
                    <Link key={i.id} to="/invoices/$invoiceId" params={{ invoiceId: i.id }} className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:border-primary/50">
                      <span><span className="font-medium">{i.clientName}</span> <span className="font-mono text-xs text-muted-foreground">{i.number}</span></span>
                      <span className="flex items-center gap-3"><Badge variant="destructive">{i.overdueDays} kun</Badge><Money minor={i.outstandingMinor} currency={i.currency} className="font-medium" /></span>
                    </Link>
                  ))}
                  {!f.topOverdue.length && <p className="py-6 text-center text-sm text-muted-foreground">Muddati o'tgan invoice yo'q 🎉</p>}
                </CardContent>
              </Card>
            )}
            <div className="grid content-start gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-primary" />Mijozlar</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div><div className="text-xl font-semibold">{data.clients.active}</div><div className="text-xs text-muted-foreground">faol</div></div>
                  <div><div className="text-xl font-semibold">{data.clients.lead}</div><div className="text-xs text-muted-foreground">lid</div></div>
                  <div><div className="text-xl font-semibold">+{data.clients.newThisMonth}</div><div className="text-xs text-muted-foreground">bu oy</div></div>
                </CardContent>
              </Card>
              {data.ops && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Server className="size-4 text-primary" />Qurilmalar va deploymentlar</CardTitle></CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Faol qurilmalar</span><Link to="/devices" className="font-semibold hover:underline">{data.ops.devicesActive}</Link></div>
                    {data.ops.devicesByClass.slice(0, 4).map((c) => <div key={c.deviceClass} className="flex justify-between pl-3 text-xs"><span className="text-muted-foreground">{CLASS_LABELS[c.deviceClass]}</span><span>{c.count}</span></div>)}
                    <div className="flex justify-between"><span className="flex items-center gap-1 text-muted-foreground"><Rocket className="size-3.5" />Bajarilayotgan</span><Link to="/deployments" className="font-semibold hover:underline">{data.ops.deploymentsRunning}</Link></div>
                    {data.ops.deploymentsPendingApproval > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tasdiq kutayotgan</span><span className="font-semibold text-warning">{data.ops.deploymentsPendingApproval}</span></div>}
                    {data.ops.deploymentsFailed30d > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Xato (30 kun)</span><span className="font-semibold text-destructive">{data.ops.deploymentsFailed30d}</span></div>}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
