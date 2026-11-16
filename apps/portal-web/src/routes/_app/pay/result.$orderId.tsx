import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { GATEWAY_LABELS, type PaymentOrderStatusDto } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { requireAccess } from '@/lib/session';

export const Route = createFileRoute('/_app/pay/result/$orderId')({ beforeLoad: requireAccess('finance'), component: PayResult });

const CLOSED = ['FULFILLED', 'FAILED', 'EXPIRED', 'CANCELLED'];
const settled = (d?: PaymentOrderStatusDto) => !!d && d.status !== 'PENDING' && (!d.checkout || d.status !== 'PAID' || CLOSED.includes(d.checkout.status));

/** Provayder sahifasidan qaytish: buyurtma holatini kuzatadi (callback bir necha soniyada keladi). */
function PayResult() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const started = useRef(Date.now());
  const { data: d, isLoading } = useQuery({
    queryKey: ['pay-order', orderId],
    queryFn: () => api.get<PaymentOrderStatusDto>(`/pay/orders/${orderId}`),
    refetchInterval: (q) => (settled(q.state.data) || Date.now() - started.current > 180_000 ? false : 1500),
  });
  useEffect(() => {
    if (d?.status === 'PAID') for (const k of ['dashboard', 'invoices', 'payments', 'subscriptions', 'catalog', 'statement', 'cards']) void qc.invalidateQueries({ queryKey: [k] });
  }, [d?.status, d?.checkout?.status, qc]);

  if (isLoading) return <Skeleton className="mx-auto h-64 max-w-lg" />;
  if (!d) return null;
  const amount = d.amountMinor ? <Money minor={d.amountMinor} currency="UZS" className="font-semibold" /> : null;
  const provider = d.provider ? GATEWAY_LABELS[d.provider] ?? d.provider : null;
  const meta = (
    <dl className="mt-4 grid gap-1 rounded-md bg-muted/50 p-3 text-left text-sm">
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Buyurtma</dt><dd className="font-mono">{d.number}</dd></div>
      {amount && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Summa</dt><dd>{amount}</dd></div>}
      {provider && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">To'lov tizimi</dt><dd>{provider}</dd></div>}
      {d.paidAt && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Vaqt</dt><dd>{dateTime(d.paidAt)}</dd></div>}
    </dl>
  );

  let icon: React.ReactNode; let title: string; let text: React.ReactNode; let actions: React.ReactNode;
  if (d.status === 'PAID' && d.checkout && d.checkout.status !== 'FULFILLED') {
    icon = <Loader2 className="size-12 animate-spin text-primary" />;
    title = "To'lov qabul qilindi";
    text = d.checkout.status === 'PAID' ? 'Obuna faollashtirilmoqda…' : "Obunani faollashtirishda kechikish bo'ldi — menejerimiz tekshiradi, pul yo'qolmaydi.";
    actions = <Button asChild variant="outline"><Link to="/">Bosh sahifa</Link></Button>;
  } else if (d.status === 'PAID') {
    icon = <CheckCircle2 className="size-12 text-success" />;
    title = "To'lov muvaffaqiyatli";
    text = d.checkout ? 'Obuna faollashtirildi. Birinchi hisob-faktura to\'langan holda kabinetda.' : "Invoice'lar yopildi. Rahmat!";
    actions = d.checkout?.subscriptionId
      ? <Button asChild><Link to="/subscriptions/$subscriptionId" params={{ subscriptionId: d.checkout.subscriptionId }}>Obunani ko'rish</Link></Button>
      : <Button asChild><Link to="/invoices">Invoice'lar</Link></Button>;
  } else if (d.status === 'PENDING') {
    icon = Date.now() - started.current > 180_000 ? <Clock className="size-12 text-warning" /> : <Loader2 className="size-12 animate-spin text-primary" />;
    title = "To'lov tasdiqlanishi kutilmoqda";
    text = "To'lov tizimi sahifasida to'lovni yakunlagan bo'lsangiz, natija bir necha soniyada shu yerda ko'rinadi. Bu sahifani yopsangiz ham to'lov yo'qolmaydi.";
    actions = <Button asChild variant="outline"><Link to="/">Bosh sahifa</Link></Button>;
  } else {
    icon = <XCircle className="size-12 text-destructive" />;
    title = d.status === 'EXPIRED' ? "Buyurtma muddati o'tdi" : "To'lov amalga oshmadi";
    text = d.failure ?? 'Pul yechilmadi. Boshqa usul bilan qayta urinib ko\'ring.';
    actions = d.purpose === 'CHECKOUT' ? <Button asChild><Link to="/services">Xizmatlarga qaytish</Link></Button> : <Button asChild><Link to="/invoices">Invoice'larga qaytish</Link></Button>;
  }
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center px-6 py-10 text-center" aria-live="polite">
        {icon}
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <div className="w-full">{meta}</div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
      </CardContent>
    </Card>
  );
}
