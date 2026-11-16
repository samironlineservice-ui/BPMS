import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Check, LayoutGrid } from 'lucide-react';
import { z } from 'zod';
import type { CatalogPlan } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { Empty } from '@/components/common/stat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { catalogQuery } from '@/lib/pay';
import { requireAccess, useAccess } from '@/lib/session';

const search = z.object({ period: z.enum(['month', 'year']).optional().catch(undefined) });
export const Route = createFileRoute('/_app/services')({
  validateSearch: (s: Record<string, unknown>) => search.parse(s),
  beforeLoad: requireAccess('finance'),
  component: Services,
});

function PlanCard({ plan, canBuy }: { plan: CatalogPlan; canBuy: boolean }) {
  const navigate = useNavigate();
  const price = plan.prices.find((x) => x.currency === 'UZS');
  if (!price) return null;
  const yearly = plan.intervalMonths === 12;
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{plan.name}</CardTitle>
        {plan.description && <CardDescription>{plan.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <span className="text-2xl font-semibold tracking-tight"><Money minor={price.unitAmountMinor} currency="UZS" /></span>
          <span className="ml-1 text-sm text-muted-foreground">/ {yearly ? 'yil' : plan.intervalMonths === 1 ? 'oy' : `${plan.intervalMonths} oy`}</span>
          {yearly && <div className="text-xs text-muted-foreground">oyiga ≈ <Money minor={(BigInt(price.unitAmountMinor) / 12n).toString()} currency="UZS" /></div>}
        </div>
        {plan.features.length > 0 && (
          <ul className="grid gap-1.5 text-sm">
            {plan.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{f}</li>)}
          </ul>
        )}
        <div className="mt-auto grid gap-1 pt-2">
          {plan.subscribed ? (
            <>
              <Button variant="outline" asChild><Link to="/subscriptions">Obunangiz bor</Link></Button>
              <p className="text-center text-xs text-muted-foreground">Tarifni o'zgartirish — <Link to="/requests/new" search={{ category: 'CHANGE' }} className="text-primary hover:underline">murojaat orqali</Link></p>
            </>
          ) : (
            <>
              <Button disabled={!canBuy} onClick={() => void navigate({ to: '/checkout', search: { price: price.planPriceId } })}>Tanlash</Button>
              {!canBuy && <p className="text-center text-xs text-muted-foreground">Sotib olish — kabinet egasi yoki buxgalter</p>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Services() {
  const { period = 'month' } = Route.useSearch();
  const interval = period === 'year' ? 12 : 1;
  const navigate = useNavigate();
  const access = useAccess();
  const { data, isLoading } = useQuery(catalogQuery);
  const hasYearly = data?.some((p) => p.plans.some((x) => x.intervalMonths === 12));
  const projects = (data ?? []).map((p) => ({ ...p, plans: p.plans.filter((x) => x.intervalMonths === interval) })).filter((p) => p.plans.length);
  return (
    <>
      <PageHeader
        title="Xizmatlar"
        description="Tarifni tanlang va onlayn to'lab darhol ulaning. Obuna har davr avtomatik davom etadi; hisob-faktura kabinetda chiqadi."
        actions={hasYearly ? (
          <Tabs value={period} onValueChange={(v) => void navigate({ to: '/services', search: { period: v === 'year' ? 'year' : undefined } })}>
            <TabsList>
              <TabsTrigger value="month">Oylik</TabsTrigger>
              <TabsTrigger value="year" className="gap-1.5">Yillik<Badge variant="outline" className="border-success/40 px-1 text-[10px] text-success">tejamkor</Badge></TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      />
      {isLoading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}
      <div className="grid gap-8">
        {projects.map((p) => (
          <section key={p.projectId} aria-labelledby={`p-${p.projectId}`}>
            <h2 id={`p-${p.projectId}`} className="text-lg font-semibold">{p.name}</h2>
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.plans.map((plan) => <PlanCard key={plan.planId} plan={plan} canBuy={access.pay} />)}
            </div>
          </section>
        ))}
      </div>
      {data && !projects.length && (
        <Empty icon={LayoutGrid} title={period === 'year' ? "Yillik tariflar yo'q" : "Katalog hozircha bo'sh"}
          text="Kerakli xizmat bo'yicha murojaat qoldiring — menejerimiz mos taklif tayyorlaydi."
          action={access.writeRequests ? <Button asChild size="sm"><Link to="/requests/new" search={{ category: 'CHANGE' }}>Murojaat yuborish</Link></Button> : undefined} />
      )}
    </>
  );
}
