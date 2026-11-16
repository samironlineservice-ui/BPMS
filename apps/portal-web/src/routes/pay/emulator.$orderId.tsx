import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { ArrowLeft, FlaskConical, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { type EmulatorResult, GATEWAY_LABELS, type PaymentOrderStatusDto } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { formatExpire, formatPan, TestCards } from '@/components/pay/test-cards';
import { ProtocolLog } from '@/components/pay/topup-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorText } from '@/lib/api';
import { companyQuery, meQuery } from '@/lib/session';

const search = z.object({ provider: z.enum(['PAYME', 'CLICK', 'UZUM']).catch('PAYME') });
export const Route = createFileRoute('/pay/emulator/$orderId')({
  validateSearch: (s: Record<string, unknown>) => search.parse(s),
  beforeLoad: async ({ context }) => {
    try { await context.queryClient.ensureQueryData(meQuery); } catch { throw redirect({ to: '/login' }); }
  },
  component: Emulator,
});

/**
 * To'lov tizimi sahifasining SINOV nusxasi (faqat lokal muhit). "To'lash" bosilganda server provayder nomidan
 * bizning webhook'larni haqiqiy protokol bo'yicha chaqiradi — natija va protokol qadamlari shu yerda ko'rinadi.
 */
function Emulator() {
  const { orderId } = Route.useParams();
  const { provider } = Route.useSearch();
  const router = useRouter();
  const company = useQuery(companyQuery);
  const order = useQuery({ queryKey: ['pay-order', orderId], queryFn: () => api.get<PaymentOrderStatusDto>(`/pay/orders/${orderId}`) });
  const [stage, setStage] = useState<'card' | 'sms' | 'done'>('card');
  const [card, setCard] = useState({ number: '', expire: '', smsCode: '' });
  const [result, setResult] = useState<EmulatorResult | null>(null);
  const pay = useMutation({
    mutationFn: (scenario: 'pay' | 'decline') => api.post<EmulatorResult>(`/pay/emulator/${orderId}`, {
      provider, scenario, cardNumber: card.number.replace(/\D/g, ''), expire: card.expire.replace(/\D/g, ''), smsCode: card.smsCode,
    }),
    onSuccess: (r) => { setResult(r); setStage('done'); },
    onError: (e) => toast.error(errorText(e)),
  });
  const label = GATEWAY_LABELS[provider] ?? provider;
  const back = () => router.history.push(`/pay/result/${orderId}`);
  const cardOk = card.number.replace(/\D/g, '').length === 16 && /^\d{2}\/\d{2}$/.test(formatExpire(card.expire));

  return (
    <div className="flex min-h-svh flex-col items-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">{label}</div>
            <div className="text-xs text-muted-foreground">To'lov sahifasi · sinov nusxasi</div>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-xs font-medium"><FlaskConical className="size-3.5" />Emulyator</span>
        </div>
        <Alert className="mb-4">
          <AlertDescription className="text-xs">
            Bu haqiqiy {label} sahifasi emas va pul yechilmaydi. Emulyator {label} serveri o'rnida turib, ADS tizimining webhook'larini haqiqiy protokol bo'yicha chaqiradi — merchant kalitlari ulanganda bu sahifa o'rniga {label}ning o'zi ochiladi.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{company.data?.legalName ?? company.data?.name ?? 'ADS'}</CardTitle>
            {order.isLoading ? <Skeleton className="h-10" /> : order.data && (
              <dl className="grid gap-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Buyurtma</dt><dd className="font-mono">{order.data.number}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Summa</dt><dd>{order.data.amountMinor ? <Money minor={order.data.amountMinor} currency="UZS" className="text-lg font-semibold" /> : '—'}</dd></div>
              </dl>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {order.data && order.data.status !== 'PENDING' && stage !== 'done' && (
              <Alert><AlertDescription>Buyurtma {order.data.status === 'PAID' ? "allaqachon to'langan" : 'yopilgan'}. <button type="button" className="text-primary hover:underline" onClick={back}>Natijani ko'rish</button></AlertDescription></Alert>
            )}
            {stage === 'card' && (
              <>
                <TestCards onPick={(c) => setCard(c)} />
                <Field label="Karta raqami"><Input inputMode="numeric" autoComplete="off" placeholder="0000 0000 0000 0000" value={formatPan(card.number)} onChange={(e) => setCard({ ...card, number: e.target.value })} className="font-mono" /></Field>
                <Field label="Amal qilish muddati" className="max-w-44"><Input inputMode="numeric" autoComplete="off" placeholder="OO/YY" value={formatExpire(card.expire)} onChange={(e) => setCard({ ...card, expire: e.target.value })} className="font-mono" /></Field>
                <Button disabled={!cardOk || order.data?.status !== 'PENDING'} onClick={() => setStage('sms')}>Davom etish</Button>
              </>
            )}
            {stage === 'sms' && (
              <>
                <p className="text-sm text-muted-foreground">Karta egasining telefoniga SMS kod yuborildi (sinov).</p>
                <Field label="SMS kod"><Input inputMode="numeric" autoComplete="one-time-code" autoFocus value={card.smsCode} onChange={(e) => setCard({ ...card, smsCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="font-mono tracking-widest" /></Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button disabled={card.smsCode.length < 4 || pay.isPending} onClick={() => pay.mutate('pay')}>{pay.isPending ? 'Yuborilmoqda…' : "To'lash"}</Button>
                  <Button variant="outline" disabled={pay.isPending} onClick={() => pay.mutate('decline')} title="Bank kartani rad etgan holatni sinash">Rad etish (sinov)</Button>
                </div>
                <button type="button" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setStage('card')}><ArrowLeft className="mr-1 size-3" />Kartani o'zgartirish</button>
              </>
            )}
            {stage === 'done' && result && (
              <>
                <ProtocolLog r={result} />
                <p className="text-xs text-muted-foreground">Yuqorida — {label} serveri nomidan yuborilgan so'rovlar va ADS javoblari (takroriy so'rovlar idempotentlikni tekshiradi).</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={back}>Saytga qaytish</Button>
                  {!result.ok && <Button variant="outline" onClick={() => { setResult(null); setStage('card'); }}>Qayta urinish</Button>}
                </div>
              </>
            )}
            <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Lock className="size-3" />Karta ma'lumoti saqlanmaydi</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
