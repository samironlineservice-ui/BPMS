import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CreditCard, Plus, RefreshCcw, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { GATEWAY_LABELS, type PaymentCardDto } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { PageHeader } from '@/components/common/page-header';
import { Empty } from '@/components/common/stat';
import { formatExpire, formatPan, TestCards } from '@/components/pay/test-cards';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { ago } from '@/lib/format';
import { CARD_TYPE, cardsQuery, payMethodsQuery } from '@/lib/pay';
import { requireAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/cards')({ beforeLoad: requireAccess('pay'), component: Cards });

const message = (e: unknown) => (e instanceof ApiError ? e.problem.title : e instanceof Error ? e.message : 'Xatolik yuz berdi');

/**
 * Karta qo'shish. Payme: karta raqami brauzerdan to'g'ridan-to'g'ri Payme'ga ketadi (cards.create), bizga faqat token keladi.
 * Click: raqam serverimiz orqali Click'ga uzatiladi va saqlanmaydi. Ikkalasida ham SMS bilan tasdiqlash.
 */
function AddCardDialog() {
  const qc = useQueryClient();
  const { data: m } = useQuery(payMethodsQuery);
  const providers = (m?.providers ?? []).filter((p) => p.cards && (p.key !== 'PAYME' || m?.paymeCards));
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>('');
  const [stage, setStage] = useState<'form' | 'sms'>('form');
  const [card, setCard] = useState({ number: '', expire: '', smsCode: '' });
  const [pending, setPending] = useState<{ token?: string; cardId?: string; phone?: string | null }>({});
  const current = provider || providers[0]?.key || '';

  const payme = async <T,>(method: string, params: object): Promise<T> => {
    const r = await fetch(m!.paymeCards!.endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Auth': m!.paymeCards!.merchantId }, body: JSON.stringify({ id: Date.now(), method, params }),
    });
    const j = (await r.json().catch(() => ({}))) as { result?: T; error?: { message?: string | { uz?: string; ru?: string } } };
    if (j.error || !j.result) {
      const msg = typeof j.error?.message === 'string' ? j.error.message : j.error?.message?.uz ?? j.error?.message?.ru;
      throw new Error(msg || "Payme javob bermadi");
    }
    return j.result;
  };
  const reset = () => { setStage('form'); setCard({ number: '', expire: '', smsCode: '' }); setPending({}); };

  const start = useMutation({
    mutationFn: async () => {
      const number = card.number.replace(/\D/g, ''); const expire = card.expire.replace(/\D/g, '');
      if (current === 'PAYME') {
        const r = await payme<{ card: { token: string } }>('cards.create', { card: { number, expire }, save: true });
        const v = await payme<{ phone?: string }>('cards.get_verify_code', { token: r.card.token });
        return { token: r.card.token, phone: v.phone ?? null };
      }
      const r = await api.post<{ cardId: string; phoneMask: string | null }>('/cards/click', { cardNumber: number, expire });
      return { cardId: r.cardId, phone: r.phoneMask };
    },
    onSuccess: (p) => { setPending(p); setStage('sms'); },
    onError: (e) => toast.error(message(e)),
  });
  const confirm = useMutation({
    mutationFn: async () => {
      if (current === 'PAYME') {
        const v = await payme<{ card: { token: string } }>('cards.verify', { token: pending.token, code: card.smsCode });
        return api.post('/cards/payme', { provider: 'PAYME', token: v.card.token });
      }
      return api.post(`/cards/${pending.cardId}/verify`, { smsCode: card.smsCode });
    },
    onSuccess: () => { toast.success("Karta qo'shildi"); setOpen(false); reset(); void qc.invalidateQueries({ queryKey: ['cards'] }); },
    onError: (e) => toast.error(message(e)),
  });
  const cardOk = card.number.replace(/\D/g, '').length === 16 && /^\d{2}\/\d{2}$/.test(formatExpire(card.expire));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button disabled={!providers.length}><Plus className="mr-2 size-4" />Karta qo'shish</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Karta qo'shish</DialogTitle>
          <DialogDescription>Uzcard yoki Humo. Karta SMS kod bilan tasdiqlanadi; biz faqat to'lov tizimi bergan tokenni saqlaymiz.</DialogDescription>
        </DialogHeader>
        {stage === 'form' ? (
          <div className="grid gap-4">
            {providers.length > 1 && (
              <div role="radiogroup" aria-label="To'lov tizimi" className="grid grid-cols-2 gap-2">
                {providers.map((p) => (
                  <button key={p.key} type="button" role="radio" aria-checked={current === p.key} onClick={() => setProvider(p.key)}
                    className={cn('rounded-md border px-3 py-2 text-sm font-medium hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', current === p.key && 'border-primary ring-1 ring-primary')}>
                    {p.label} orqali
                  </button>
                ))}
              </div>
            )}
            <TestCards onPick={(c) => setCard(c)} />
            <Field label="Karta raqami"><Input inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={formatPan(card.number)} onChange={(e) => setCard({ ...card, number: e.target.value })} className="font-mono" /></Field>
            <Field label="Amal qilish muddati" className="max-w-44"><Input inputMode="numeric" autoComplete="cc-exp" placeholder="OO/YY" value={formatExpire(card.expire)} onChange={(e) => setCard({ ...card, expire: e.target.value })} className="font-mono" /></Field>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">SMS kod {pending.phone ? <span className="font-mono text-foreground">{pending.phone}</span> : 'karta egasining telefoni'}ga yuborildi.</p>
            <Field label="SMS kod"><Input inputMode="numeric" autoComplete="one-time-code" autoFocus value={card.smsCode} onChange={(e) => setCard({ ...card, smsCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="font-mono tracking-widest" /></Field>
          </div>
        )}
        <DialogFooter>
          {stage === 'form'
            ? <Button disabled={!cardOk || start.isPending} onClick={() => start.mutate()}>{start.isPending ? 'Yuborilmoqda…' : 'SMS kod olish'}</Button>
            : <><Button variant="outline" onClick={reset}>Orqaga</Button><Button disabled={card.smsCode.length < 4 || confirm.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? 'Tekshirilmoqda…' : 'Tasdiqlash'}</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardRow({ c }: { c: PaymentCardDto }) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ['cards'] });
  const set = useMutation({ mutationFn: (b: { isDefault?: boolean; autopay?: boolean }) => api.post(`/cards/${c.id}/settings`, b), onSuccess: done, onError: (e) => toast.error(message(e)) });
  const remove = useMutation({ mutationFn: () => api.post(`/cards/${c.id}/remove`), onSuccess: () => { toast.success("Karta o'chirildi"); done(); }, onError: (e) => toast.error(message(e)) });
  return (
    <Card className={cn(c.isDefault && 'border-primary/40')}>
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <span className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary"><CreditCard className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium">{c.maskedPan}</span>
            {c.isDefault && <Badge variant="outline" className="border-primary/40 text-primary">asosiy</Badge>}
            {c.autopay && <Badge variant="outline" className="border-success/40 text-success">avtomatik to'lov</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            {c.cardType ? `${CARD_TYPE[c.cardType] ?? c.cardType} · ` : ''}muddati {c.expire} · {GATEWAY_LABELS[c.provider] ?? c.provider} orqali{c.lastUsedAt ? ` · oxirgi to'lov ${ago(c.lastUsedAt)}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={c.autopay} disabled={set.isPending} onCheckedChange={(v) => set.mutate({ autopay: v })} aria-label="Avtomatik to'lov" />
            <span className="hidden sm:inline">Avtomatik</span>
          </label>
          {!c.isDefault && <Button size="sm" variant="ghost" disabled={set.isPending} onClick={() => set.mutate({ isDefault: true })}><Star className="mr-1 size-3.5" />Asosiy qilish</Button>}
          <AlertDialog>
            <AlertDialogTrigger asChild><Button size="icon" variant="ghost" aria-label="Kartani o'chirish"><Trash2 className="size-4" /></Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Kartani o'chirasizmi?</AlertDialogTitle>
                <AlertDialogDescription>{c.maskedPan} ro'yxatdan o'chiriladi{c.autopay ? " va avtomatik to'lov to'xtaydi" : ''}. Keyin qayta qo'shishingiz mumkin.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Bekor qilish</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate()}>O'chirish</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function Cards() {
  const { data, isLoading } = useQuery(cardsQuery);
  return (
    <>
      <PageHeader title="To'lov kartalari" description="Saqlangan kartalar bilan bir bosishda to'lash va avtomatik to'lov" actions={<AddCardDialog />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid content-start gap-3 lg:col-span-2">
          {isLoading && <Skeleton className="h-20" />}
          {data?.map((c) => <CardRow key={c.id} c={c} />)}
          {data && !data.length && <Empty icon={CreditCard} title="Kartalar yo'q" text="Kartani qo'shsangiz, invoice va obunalarni bir bosishda to'laysiz, xohlasangiz — avtomatik." />}
        </div>
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><RefreshCcw className="size-4 text-muted-foreground" />Avtomatik to'lov</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>Yoqilgan kartadan har yangi hisob-faktura chiqqan kuni avtomatik yechiladi. Mablag' yetmasa, keyingi kunlari yana urinib ko'riladi (jami 3 marta).</p>
            <p>Avtomatik to'lov faqat bitta kartada bo'ladi; uni istalgan vaqtda o'chirishingiz mumkin.</p>
            <p className="flex items-start gap-2 text-xs"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />Karta raqami va muddati bizning serverlarda saqlanmaydi — faqat to'lov tizimi bergan shifrlangan token.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
