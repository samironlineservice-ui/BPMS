import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Smartphone, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { type EmulatorResult, GATEWAY_LABELS } from '@ads/contracts';
import { CopyButton } from '@/components/common/copy-button';
import { Field } from '@/components/common/field';
import { formatExpire, formatPan, TestCards } from '@/components/pay/test-cards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorText } from '@/lib/api';
import { payMethodsQuery } from '@/lib/pay';
import { meQuery, useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

/** Protokol qadamlari (emulyator natijasi). */
export function ProtocolLog({ r }: { r: EmulatorResult }) {
  return (
    <div className={cn('rounded-md border p-3 text-xs', r.ok ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5')}>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">{r.ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}{r.message}</div>
      <ol className="grid gap-0.5 font-mono">
        {r.steps.map((s, i) => (
          <li key={i} className="flex gap-2"><span className={s.ok ? 'text-success' : 'text-destructive'}>{s.ok ? '✓' : '✗'}</span><span className="font-medium">{s.name}</span><span className="truncate text-muted-foreground">{s.detail}</span></li>
        ))}
      </ol>
    </div>
  );
}

/** Hisobni to'ldirish: shaxsiy hisob raqami bilan ilova/terminal orqali; emulyator rejimida — sinov to'lovi. */
export function TopupCard() {
  const { data: me } = useQuery(meQuery);
  const { data: m } = useQuery(payMethodsQuery);
  const access = useAccess();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('PAYNET');
  const [amount, setAmount] = useState('100000');
  const [card, setCard] = useState({ number: '', expire: '', smsCode: '' });
  const [result, setResult] = useState<EmulatorResult | null>(null);
  const sim = useMutation({
    mutationFn: () => api.post<EmulatorResult>('/pay/emulator/topup', {
      provider, amount: amount.replace(/\s/g, '').replace(',', '.'), cardNumber: card.number.replace(/\D/g, ''), expire: card.expire.replace(/\D/g, ''), smsCode: card.smsCode,
    }),
    onSuccess: (r) => {
      setResult(r);
      for (const k of ['payments', 'dashboard', 'invoices', 'statement']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!me || !m) return null;
  const providers = m.topup.providers;
  const emulator = !!m.testCards?.length && access.pay;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="size-4 text-muted-foreground" />Hisobni to'ldirish</CardTitle>
        <CardDescription>
          {providers.length ? `${providers.map((p) => GATEWAY_LABELS[p] ?? p).join(', ')} ilovasida yoki terminalida «ADS» xizmatini tanlab, shaxsiy hisob raqamingizni kiriting.` : "Onlayn to'lov tizimlari hozircha ulanmagan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-muted-foreground">Shaxsiy hisob raqami</span>
          <span className="flex items-center gap-1 font-mono text-lg font-semibold tracking-wider">{m.topup.accountNo}<CopyButton text={m.topup.accountNo} /></span>
        </div>
        <p className="text-xs text-muted-foreground">Tushgan summa avans sifatida yoziladi va to'lanmagan invoice'larga avtomatik qo'llanadi (eng eskisidan boshlab).</p>
        {emulator && (
          <div className="rounded-md border border-dashed">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium">
              Sinov: ilovadan to'lovni taqlid qilish (emulyator)<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="grid gap-3 border-t p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="To'lov tizimi">
                    <Select value={provider} onValueChange={(v) => { setProvider(v); setResult(null); }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{providers.map((p) => <SelectItem key={p} value={p}>{GATEWAY_LABELS[p] ?? p}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Summa, so'm"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                </div>
                {provider !== 'PAYNET' && (
                  <>
                    <TestCards onPick={(c) => setCard(c)} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Karta raqami" className="sm:col-span-2"><Input inputMode="numeric" autoComplete="off" value={formatPan(card.number)} onChange={(e) => setCard({ ...card, number: e.target.value })} className="font-mono" /></Field>
                      <Field label="Muddati"><Input inputMode="numeric" placeholder="OO/YY" value={formatExpire(card.expire)} onChange={(e) => setCard({ ...card, expire: e.target.value })} className="font-mono" /></Field>
                    </div>
                    <Field label="SMS kod"><Input inputMode="numeric" value={card.smsCode} onChange={(e) => setCard({ ...card, smsCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="font-mono" /></Field>
                  </>
                )}
                <Button variant="outline" disabled={sim.isPending || !amount} onClick={() => sim.mutate()}>{sim.isPending ? 'Yuborilmoqda…' : 'Sinov to\'lovini yuborish'}</Button>
                {result && <ProtocolLog r={result} />}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
