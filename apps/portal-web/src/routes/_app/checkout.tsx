import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, CalendarClock, Check, Minus, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { CheckoutQuote, PayStartResult } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { MethodPicker } from '@/components/pay/method-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorText } from '@/lib/api';
import { date, periodRange } from '@/lib/format';
import { catalogQuery, choiceBody, openPayment, type PayChoice, PER_INTERVAL } from '@/lib/pay';
import { requireAccess } from '@/lib/session';

const search = z.object({ price: z.string().optional().catch(undefined), qty: z.coerce.number().int().min(1).max(100).optional().catch(undefined) });
export const Route = createFileRoute('/_app/checkout')({
  validateSearch: (s: Record<string, unknown>) => search.parse(s),
  beforeLoad: requireAccess('pay'),
  component: Checkout,
});

function Checkout() {
  const { price, qty } = Route.useSearch();
  const router = useRouter();
  const [quantity, setQuantity] = useState(qty ?? 1);
  const [choice, setChoice] = useState<PayChoice | null>(null);
  const catalog = useQuery(catalogQuery);
  const found = catalog.data?.flatMap((p) => p.plans.map((plan) => ({ project: p, plan }))).find((x) => x.plan.prices.some((pr) => pr.planPriceId === price));
  const items = [{ planPriceId: price ?? '', quantity }];
  const quote = useQuery({
    queryKey: ['checkout-quote', price, quantity],
    queryFn: () => api.post<CheckoutQuote>('/checkout/quote', { items }),
    enabled: !!found && !found.plan.subscribed,
    placeholderData: (prev) => prev,
  });
  const pay = useMutation({
    mutationFn: () => api.post<PayStartResult>('/checkout', { items, ...choiceBody(choice!) }),
    onSuccess: (r) => openPayment(r, (p) => router.history.push(p)),
    onError: (e) => toast.error(errorText(e)),
  });

  const back = <Link to="/services" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" />Xizmatlar</Link>;
  if (catalog.isLoading) return <Skeleton className="h-64" />;
  if (!found) return <>{back}<Alert><AlertDescription>Tarif topilmadi yoki katalogdan olib tashlangan. <Link to="/services" className="text-primary hover:underline">Xizmatlarga qaytish</Link></AlertDescription></Alert></>;
  const { project, plan } = found;
  const q = quote.data;
  return (
    <>
      {back}
      <PageHeader title="Obunani rasmiylashtirish" description={`${project.name} · ${plan.name}`} />
      {plan.subscribed ? (
        <Alert><AlertDescription>Bu xizmatga obunangiz bor. Tarifni o'zgartirish uchun <Link to="/requests/new" search={{ category: 'CHANGE' }} className="text-primary hover:underline">murojaat yuboring</Link>.</AlertDescription></Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="grid content-start gap-4 lg:col-span-3">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Buyurtma</CardTitle></CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-muted-foreground">{project.name} · {PER_INTERVAL[plan.intervalMonths] ?? `${plan.intervalMonths} oyga`} to'lov</div>
                  </div>
                  <div className="flex items-center gap-1" role="group" aria-label="Soni">
                    <Button size="icon" variant="outline" className="size-8" aria-label="Kamaytirish" disabled={quantity <= 1} onClick={() => setQuantity((n) => Math.max(1, n - 1))}><Minus className="size-3.5" /></Button>
                    <Input aria-label="Soni" inputMode="numeric" className="h-8 w-14 text-center" value={quantity} onChange={(e) => setQuantity(Math.min(100, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
                    <Button size="icon" variant="outline" className="size-8" aria-label="Ko'paytirish" disabled={quantity >= 100} onClick={() => setQuantity((n) => Math.min(100, n + 1))}><Plus className="size-3.5" /></Button>
                  </div>
                </div>
                {plan.features.length > 0 && (
                  <ul className="grid gap-1 text-muted-foreground">{plan.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />{f}</li>)}</ul>
                )}
                <p className="text-xs text-muted-foreground">Soni — masalan, filiallar, kameralar yoki omborlar soni (tarif shartiga ko'ra).</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Hisob-kitob</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {!q ? <Skeleton className="h-24" /> : (
                  <>
                    <div className="text-muted-foreground">
                      Birinchi davr: {periodRange(q.periodStart, q.periodEnd)}
                      {q.partial && <span className="block text-xs">Oy (davr) boshidan emas — faqat qolgan kunlar uchun hisoblanadi.</span>}
                    </div>
                    <div className="grid gap-1">
                      {q.lines.map((l, i) => (
                        <div key={i} className="flex justify-between gap-3"><span>{l.description}{l.quantity > 1 && ` × ${l.quantity}`}</span><Money minor={l.amountMinor} currency={q.currency} /></div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t pt-3 text-base"><span className="font-medium">Bugun to'lanadi</span><Money minor={q.amountMinor} currency={q.currency} className="text-xl font-semibold" /></div>
                    <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                      <span>Keyingi hisob: {date(q.nextBillingOn)} dan {PER_INTERVAL[q.intervalMonths] ?? ''} <Money minor={q.nextAmountMinor} currency={q.currency} className="font-medium text-foreground" />. Hisob-faktura kabinetda chiqadi; avtomatik to'lovni «Kartalar» bo'limida yoqishingiz mumkin.</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card className="lg:sticky lg:top-28">
              <CardHeader className="pb-3"><CardTitle className="text-base">To'lov usuli</CardTitle></CardHeader>
              <CardContent className="grid min-w-0 gap-4">
                <MethodPicker value={choice} onChange={setChoice} />
                <Button size="lg" disabled={!choice || !q || pay.isPending || quote.isFetching} onClick={() => pay.mutate()}>
                  {pay.isPending ? 'Yuborilmoqda…' : q ? <>To'lash · <Money minor={q.amountMinor} currency={q.currency} /></> : "To'lash"}
                </Button>
                <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />To'lov tasdiqlangach obuna darhol faollashadi va birinchi hisob-faktura to'langan holda chiqadi. Karta raqami bizda saqlanmaydi.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
