import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, CalendarClock, Repeat } from 'lucide-react';
import type { PortalSubscription } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { Empty } from '@/components/common/stat';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { date, periodRange } from '@/lib/format';

export const Route = createFileRoute('/_app/subscriptions/')({ component: Subscriptions });
const INTERVAL: Record<number, string> = { 1: 'oyiga', 3: 'chorakka', 6: 'yarim yilga', 12: 'yiliga' };
const ORDER: Record<string, number> = { PAST_DUE: 0, SUSPENDED: 1, ACTIVE: 2, TRIALING: 3, CANCELLED: 4 };

function Subscriptions() {
  const { data, isLoading } = useQuery({ queryKey: ['subscriptions'], queryFn: () => api.get<PortalSubscription[]>('/subscriptions') });
  const rows = [...(data ?? [])].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  return (
    <>
      <PageHeader title="Obunalar" description="Foydalanayotgan xizmatlaringiz, tariflar va hisob davrlari" />
      {isLoading && <Skeleton className="h-40" />}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((s) => (
          <Card key={s.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                {s.projectName}
                <span className="flex flex-wrap gap-1"><StatusBadge status={s.status} />{s.cancelAtPeriodEnd && <Badge variant="outline">davr oxirida tugaydi</Badge>}</span>
              </CardTitle>
              <div className="font-mono text-xs text-muted-foreground">{s.code}</div>
            </CardHeader>
            <CardContent className="grid flex-1 gap-2 text-sm">
              {s.items.map((i, k) => (
                <div key={k} className="flex justify-between gap-2">
                  <span>{i.planName} × {i.quantity}{i.discountBp ? <span className="text-xs text-muted-foreground"> (−{i.discountBp / 100}%)</span> : null}</span>
                  {i.unitAmountMinor && <span className="whitespace-nowrap"><Money minor={i.unitAmountMinor} currency={s.currency} /> <span className="text-xs text-muted-foreground">{INTERVAL[i.intervalMonths]}</span></span>}
                </div>
              ))}
              {s.mrrMinor && <div className="flex justify-between border-t pt-2"><span className="flex items-center gap-1.5 text-muted-foreground"><Repeat className="size-3.5" />Oylik</span><Money minor={s.mrrMinor} currency={s.currency} className="font-semibold" /></div>}
              <div className="grid gap-0.5 text-xs text-muted-foreground">
                {s.status === 'TRIALING' && s.trialEndsOn && <span>Sinov muddati: {date(s.trialEndsOn)} gacha</span>}
                {s.currentPeriodStart && <span>Joriy davr: {periodRange(s.currentPeriodStart, s.currentPeriodEnd)}</span>}
                {s.nextBillingOn && <span className="flex items-center gap-1"><CalendarClock className="size-3" />Keyingi hisob: {date(s.nextBillingOn)}</span>}
                {s.pendingChangeOn && <span className="text-primary">{date(s.pendingChangeOn)} dan tarif o'zgaradi</span>}
              </div>
            </CardContent>
            <div className="border-t px-6 py-3">
              <Link to="/subscriptions/$subscriptionId" params={{ subscriptionId: s.id }} className="inline-flex items-center text-sm text-primary hover:underline">Batafsil<ArrowRight className="ml-1 size-3.5" /></Link>
            </div>
          </Card>
        ))}
      </div>
      {data && !data.length && <Empty icon={Repeat} title="Obunalar yo'q" text="Xizmatga ulanish uchun menejeringiz bilan bog'laning yoki murojaat yuboring." />}
    </>
  );
}
