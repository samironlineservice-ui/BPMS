import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { InvoiceDetail, PaymentDetail } from '@ads/contracts';
import { AsyncCombobox } from '@/components/common/async-combobox';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { searchClients } from '@/features/projects/api';
import { invoicesQuery, METHOD_LABELS, minorToInput, MONEY_KEYS, todayIso } from './api';

const clean = (v: string) => v.replace(/\s/g, '').replace(',', '.');
const moneyOk = (v: string) => /^\d+(\.\d{1,2})?$/.test(clean(v)) && Number(clean(v)) > 0;
function useInvalidate() {
  const qc = useQueryClient();
  return () => { for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: k }); };
}

export function PaymentDialog({ clientId: fixedClient, clientName, currency: fixedCurrency, amount: presetAmount, trigger }: {
  clientId?: string; clientName?: string; currency?: string; amount?: string; trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(fixedClient ?? '');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [currency, setCurrency] = useState(fixedCurrency ?? 'UZS');
  const [amount, setAmount] = useState(presetAmount ?? '');
  const [date, setDate] = useState(todayIso());
  const [ref, setRef] = useState(''); const [notes, setNotes] = useState(''); const [rate, setRate] = useState('');
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const can = useCan();
  const m = useMutation({
    mutationFn: () => api.post<{ id: string; code: string; status: string }>('/payments', {
      clientId, method, currency, amount: clean(amount), receivedOn: date, externalRef: ref || null, notes: notes || null, fxRate: currency === 'USD' && rate ? clean(rate) : null,
    }),
    onSuccess: (r) => {
      toast.success(r.status === 'POSTED' ? `${r.code} qabul qilindi va taqsimlandi` : `${r.code} kiritildi — rahbar tasdig'i kutilmoqda`);
      setOpen(false); invalidate();
      void navigate({ to: '/payments/$paymentId', params: { paymentId: r.id } });
    },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setClientId(fixedClient ?? ''); setAmount(presetAmount ?? ''); setCurrency(fixedCurrency ?? 'UZS'); setDate(todayIso()); setRef(''); setNotes(''); setRate(''); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>To'lov kiritish</DialogTitle>
          <DialogDescription>{can('payments:approve') ? "Siz kiritgan to'lov darhol tasdiqlanadi va ochiq invoice'larga taqsimlanadi." : "To'lov rahbar tasdig'idan keyin balansga tushadi."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {fixedClient ? <Field label="Mijoz"><Input value={clientName ?? ''} disabled /></Field> : (
            <Field label="Mijoz" required><AsyncCombobox value={clientId} onChange={(it) => setClientId(it?.id ?? '')} fetcher={searchClients} queryKey="clients" placeholder="Mijozni qidiring…" /></Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Usul">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{['BANK_TRANSFER', 'CASH', 'CARD_TERMINAL'].map((k) => <SelectItem key={k} value={k}>{METHOD_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Sana"><Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Valyuta">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Summa" required error={amount && !moneyOk(amount) ? "Masalan: 1500000 yoki 120.50" : undefined}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            {currency === 'USD' && <Field label="Kurs (ixtiyoriy)" hint="Bo'sh — shu sanadagi MB kursi" className="sm:col-span-2"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="12100.50" /></Field>}
            <Field label="Hujjat raqami" hint="Bank to'lov topshiriqnomasi va h.k." className="sm:col-span-2"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          </div>
          <Field label="Izoh"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter><Button disabled={!clientId || !moneyOk(amount) || m.isPending} onClick={() => m.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LineRow { description: string; quantity: string; unitAmount: string; vat: string }
export function OneTimeInvoiceDialog({ clientId: fixedClient, clientName, trigger }: { clientId?: string; clientName?: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(fixedClient ?? '');
  const [currency, setCurrency] = useState('UZS');
  const [dueDays, setDueDays] = useState('10');
  const [lines, setLines] = useState<LineRow[]>([{ description: '', quantity: '1', unitAmount: '', vat: '0' }]);
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const set = (i: number, p: Partial<LineRow>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const valid = clientId && lines.every((l) => l.description.trim().length >= 2 && Number(l.quantity) > 0 && moneyOk(l.unitAmount));
  const m = useMutation({
    mutationFn: () => api.post<{ id: string; number: string }>('/invoices', {
      clientId, currency, dueDays: Number(dueDays || 0),
      lines: lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitAmount: clean(l.unitAmount), vatRateBp: Math.round(Number(l.vat || 0) * 100) })),
    }),
    onSuccess: (r) => { toast.success(`Invoice chiqarildi: ${r.number}`); setOpen(false); invalidate(); void navigate({ to: '/invoices/$invoiceId', params: { invoiceId: r.id } }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setClientId(fixedClient ?? ''); setLines([{ description: '', quantity: '1', unitAmount: '', vat: '0' }]); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Bir martalik invoice</DialogTitle><DialogDescription>O'rnatish, sozlash, qo'shimcha ishlar va h.k. Darhol raqamlanadi va chiqariladi.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          {fixedClient ? <Field label="Mijoz"><Input value={clientName ?? ''} disabled /></Field> : (
            <Field label="Mijoz" required><AsyncCombobox value={clientId} onChange={(it) => setClientId(it?.id ?? '')} fetcher={searchClients} queryKey="clients" placeholder="Mijozni qidiring…" /></Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valyuta">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="To'lov muddati (kun)"><Input inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_4.5rem_8rem_4.5rem_auto] sm:items-end">
              <Field label="Xizmat"><Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} /></Field>
              <Field label="Miqdor"><Input inputMode="numeric" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Narx"><Input inputMode="decimal" value={l.unitAmount} onChange={(e) => set(i, { unitAmount: e.target.value })} /></Field>
              <Field label="QQS %"><Input inputMode="decimal" value={l.vat} onChange={(e) => set(i, { vat: e.target.value })} /></Field>
              <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Olib tashlash"><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <div><Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { description: '', quantity: '1', unitAmount: '', vat: '0' }])}><Plus className="mr-1 size-4" />Qator</Button></div>
        </div>
        <DialogFooter><Button disabled={!valid || m.isPending} onClick={() => m.mutate()}>Chiqarish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sabab (+ ixtiyoriy summa) so'raladigan amallar: credit note, void, refund, rad etish. */
export function ReasonDialog({ title, description, withAmount, amountLabel = 'Summa', defaultAmount, confirmText = 'Yuborish', destructive, trigger, onSubmit }: {
  title: string; description?: string; withAmount?: boolean; amountLabel?: string; defaultAmount?: string; confirmText?: string; destructive?: boolean;
  trigger: React.ReactNode; onSubmit: (p: { reason: string; amount?: string }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(''); const [amount, setAmount] = useState(defaultAmount ?? '');
  const invalidate = useInvalidate();
  const m = useMutation({
    mutationFn: () => onSubmit({ reason: reason.trim(), amount: withAmount ? clean(amount) : undefined }),
    onSuccess: () => { setOpen(false); invalidate(); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setReason(''); setAmount(defaultAmount ?? ''); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <div className="grid gap-4">
          {withAmount && <Field label={amountLabel} required><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
          <Field label="Sabab" required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={reason.trim().length < 3 || (withAmount && !moneyOk(amount)) || m.isPending} onClick={() => m.mutate()}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** To'lovni tanlangan invoice'larga qo'lda taqsimlash. */
export function AllocateDialog({ payment, trigger }: { payment: PaymentDetail; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ ...invoicesQuery({ clientId: payment.client.id, status: 'OPEN', pageSize: 50 }), enabled: open });
  const [picked, setPicked] = useState<Record<string, string>>({});
  const invalidate = useInvalidate();
  const m = useMutation({
    mutationFn: () => api.post(`/payments/${payment.id}/allocate`, { items: Object.entries(picked).filter(([, v]) => moneyOk(v)).map(([invoiceId, amount]) => ({ invoiceId, amount: clean(amount) })) }),
    onSuccess: () => { toast.success('Taqsimlandi'); setOpen(false); setPicked({}); invalidate(); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Taqsimlash — {payment.code}</DialogTitle>
          <DialogDescription>Taqsimlanmagan: <Money minor={payment.unallocatedMinor} currency={payment.currency} />. Summalar invoice valyutasida kiritiladi.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-96 gap-2 overflow-auto">
          {data?.items.map((inv) => (
            <label key={inv.id} className="grid grid-cols-[auto_1fr_9rem] items-center gap-3 rounded-md border p-2 text-sm">
              <Checkbox checked={inv.id in picked} onCheckedChange={(c) => {
                const next = { ...picked };
                if (c) next[inv.id] = minorToInput(inv.outstandingMinor); else delete next[inv.id];
                setPicked(next);
              }} />
              <div>
                <div className="font-medium">{inv.number} <span className="text-xs text-muted-foreground">· muddat {inv.dueDate}</span></div>
                <div className="text-xs text-muted-foreground">Qoldiq: <Money minor={inv.outstandingMinor} currency={inv.currency} /></div>
              </div>
              <Input inputMode="decimal" disabled={!(inv.id in picked)} value={picked[inv.id] ?? ''} onChange={(e) => setPicked({ ...picked, [inv.id]: e.target.value })} />
            </label>
          ))}
          {data && !data.items.length && <p className="py-6 text-center text-sm text-muted-foreground">Ochiq invoice'lar yo'q</p>}
        </div>
        <DialogFooter><Button disabled={!Object.keys(picked).length || m.isPending} onClick={() => m.mutate()}>Taqsimlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const requestCreditNote = (inv: InvoiceDetail) => (p: { reason: string; amount?: string }) =>
  api.post<{ status: string }>(`/invoices/${inv.id}/credit-note`, { amount: p.amount, reason: p.reason })
    .then((r) => toast.success(r.status === 'EXECUTED' ? 'Credit note chiqarildi' : "Credit note so'rovi rahbarga yuborildi"));
export const requestVoid = (inv: InvoiceDetail) => (p: { reason: string }) =>
  api.post<{ status: string }>(`/invoices/${inv.id}/void`, { reason: p.reason })
    .then((r) => toast.success(r.status === 'EXECUTED' ? 'Invoice bekor qilindi' : "Bekor qilish so'rovi rahbarga yuborildi"));
