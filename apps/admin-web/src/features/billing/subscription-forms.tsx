import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { mulDivRound, parseMoney, type SubscriptionDetail } from '@ads/contracts';
import { AsyncCombobox } from '@/components/common/async-combobox';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { money } from '@/lib/format';
import { clientProjectsQuery, searchClients } from '@/features/projects/api';
import { INTERVAL_LABELS, minorToInput, MONEY_KEYS, plansQuery, todayIso } from './api';

export interface ItemRow { planPriceId: string; quantity: string; discountPct: string; unitAmount: string }
const emptyRow = (): ItemRow => ({ planPriceId: '', quantity: '1', discountPct: '0', unitAmount: '' });
const moneyOk = (v: string) => /^\d+([.,]\d{1,2})?$/.test(v.replace(/\s/g, ''));

/** Tarif qatorlari muharriri + oylik MRR hisobi (server bilan bir xil formula). */
export function ItemsEditor({ projectId, currency, at, rows, onChange }: { projectId: string; currency: string; at: string; rows: ItemRow[]; onChange: (r: ItemRow[]) => void }) {
  const { data: plans } = useQuery({ ...plansQuery(projectId), enabled: !!projectId });
  const prices = useMemo(() => (plans ?? []).filter((p) => p.isActive).flatMap((p) =>
    p.prices.filter((x) => x.currency === currency && x.validFrom <= at && (!x.validTo || x.validTo > at)).map((x) => ({ ...x, plan: p }))), [plans, currency, at]);
  const byId = new Map(prices.map((p) => [p.id, p]));
  const set = (i: number, patch: Partial<ItemRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  let mrr = 0n;
  for (const r of rows) {
    const p = byId.get(r.planPriceId);
    if (!p || !Number(r.quantity)) continue;
    const unit = r.unitAmount && moneyOk(r.unitAmount) ? parseMoney(r.unitAmount) : BigInt(p.unitAmountMinor);
    const bp = Math.round(Number(r.discountPct || 0) * 100);
    mrr += mulDivRound(BigInt(Number(r.quantity)) * unit * BigInt(10000 - bp), 1n, 10000n * BigInt(p.plan.intervalMonths));
  }
  if (projectId && plans && !prices.length) {
    return <Alert><AlertDescription>Bu loyihada {currency} valyutasida amaldagi tarif narxi yo'q. Loyiha → Tariflar bo'limida narx qo'shing.</AlertDescription></Alert>;
  }
  return (
    <div className="grid gap-3">
      {rows.map((r, i) => {
        const p = byId.get(r.planPriceId);
        return (
          <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_5rem_5rem_9rem_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label className="text-xs">Tarif</Label>
              <Select value={r.planPriceId || undefined} onValueChange={(v) => set(i, { planPriceId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>
                  {prices.map((x) => <SelectItem key={x.id} value={x.id}>{x.plan.name} — {money(x.unitAmountMinor, x.currency)} / {INTERVAL_LABELS[x.plan.intervalMonths]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label className="text-xs">Miqdor</Label><Input inputMode="numeric" value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value.replace(/\D/g, '') })} /></div>
            <div className="grid gap-1.5"><Label className="text-xs">Chegirma %</Label><Input inputMode="decimal" value={r.discountPct} onChange={(e) => set(i, { discountPct: e.target.value })} /></div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Kelishilgan narx</Label>
              <Input inputMode="decimal" value={r.unitAmount} placeholder={p ? minorToInput(p.unitAmountMinor) : ''} onChange={(e) => set(i, { unitAmount: e.target.value })} />
            </div>
            <Button type="button" variant="ghost" size="icon" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Olib tashlash"><Trash2 className="size-4" /></Button>
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyRow()])}><Plus className="mr-1 size-4" />Qator</Button>
        <span className="text-sm text-muted-foreground">Oylik MRR: <b className="text-foreground"><Money minor={mrr} currency={currency} /></b></span>
      </div>
    </div>
  );
}

const toItems = (rows: ItemRow[]) => rows.filter((r) => r.planPriceId).map((r) => ({
  planPriceId: r.planPriceId, quantity: Number(r.quantity || 1), discountBp: Math.round(Number(r.discountPct || 0) * 100),
  unitAmount: r.unitAmount ? r.unitAmount.replace(/\s/g, '').replace(',', '.') : null,
}));

export function SubscriptionCreateSheet({ clientId: fixedClient, trigger }: { clientId?: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(fixedClient ?? '');
  const [cpId, setCpId] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [start, setStart] = useState(todayIso());
  const [trial, setTrial] = useState('0'); const [terms, setTerms] = useState('10'); const [grace, setGrace] = useState('15');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const links = useQuery({ ...clientProjectsQuery({ clientId }), enabled: open && !!clientId });
  const cp = links.data?.find((l) => l.id === cpId);
  useEffect(() => { if (open) { setClientId(fixedClient ?? ''); setCpId(''); setRows([emptyRow()]); setStart(todayIso()); setTrial('0'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRows([emptyRow()]); }, [cpId, currency]);
  const m = useMutation({
    mutationFn: () => api.post<{ id: string; code: string }>('/subscriptions', {
      clientProjectId: cpId, currency, items: toItems(rows), startDate: start, trialDays: Number(trial || 0), paymentTermsDays: Number(terms || 0), graceDays: Number(grace || 0),
    }),
    onSuccess: (r) => {
      toast.success(`Obuna yaratildi: ${r.code}`); setOpen(false);
      for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: k });
      void navigate({ to: '/subscriptions/$subscriptionId', params: { subscriptionId: r.id } });
    },
    onError: (e) => handleApiError(e),
  });
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Yangi obuna</SheetTitle>
          <SheetDescription>Birinchi davr (oy oxirigacha) kunlik hisoblanadi, keyin har oyning 1-sanasida invoice chiqadi.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          {!fixedClient && (
            <Field label="Mijoz" required>
              <AsyncCombobox value={clientId} onChange={(it) => { setClientId(it?.id ?? ''); setCpId(''); }} fetcher={searchClients} queryKey="clients" placeholder="Mijozni qidiring…" />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Loyiha" required hint={clientId && links.data && !links.data.length ? "Mijoz loyihaga ulanmagan — avval ulang" : undefined}>
              <Select value={cpId || undefined} onValueChange={setCpId} disabled={!clientId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>{links.data?.map((l) => <SelectItem key={l.id} value={l.id}>{l.projectName}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Valyuta" hint="Keyin o'zgartirib bo'lmaydi">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="UZS">UZS — so'm</SelectItem><SelectItem value="USD">USD — dollar (so'mda MB kursi bo'yicha)</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          {cp && <ItemsEditor projectId={cp.projectId} currency={currency} at={start} rows={rows} onChange={setRows} />}
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Boshlanish sanasi"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Sinov (kun)"><Input inputMode="numeric" value={trial} onChange={(e) => setTrial(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="To'lov muddati (kun)"><Input inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Imtiyoz (kun)" hint="Keyin to'xtatiladi"><Input inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
        </div>
        <SheetFooter><Button disabled={!cpId || !toItems(rows).length || m.isPending} onClick={() => m.mutate()}>Obuna yaratish</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function SubscriptionChangeDialog({ sub, projectId, trigger }: { sub: SubscriptionDetail; projectId: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const current = sub.revisions.find((r) => !r.validTo) ?? sub.revisions[0];
  const initial = (): ItemRow[] => current?.items.map((i) => ({ planPriceId: i.planPriceId, quantity: String(i.quantity), discountPct: String(i.discountBp / 100), unitAmount: minorToInput(i.unitAmountMinor) })) ?? [emptyRow()];
  const [rows, setRows] = useState<ItemRow[]>(initial);
  const [effective, setEffective] = useState<'now' | 'next_period'>('next_period');
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const at = effective === 'now' ? todayIso() : (sub.nextBillingOn ?? todayIso());
  const m = useMutation({
    mutationFn: () => api.post<{ applied: string; invoiceId?: string; effectiveOn?: string }>(`/subscriptions/${sub.id}/change`, { items: toItems(rows), effective, reason: reason || null, rowVersion: sub.rowVersion }),
    onSuccess: (r) => {
      toast.success(r.applied === 'now' ? (r.invoiceId ? "O'zgardi — qayta hisob invoice'i chiqarildi" : "O'zgardi") : `${r.effectiveOn} dan kuchga kiradi`);
      setOpen(false); for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: k });
    },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setRows(initial()); setReason(''); setEffective('next_period'); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Obunani o'zgartirish — {sub.code}</DialogTitle>
          <DialogDescription>Oshirish darhol (qolgan kunlar uchun qayta hisob invoice'i) yoki keyingi davrdan; kamaytirish — faqat keyingi davrdan.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={effective === 'next_period' ? 'default' : 'outline'} size="sm" onClick={() => setEffective('next_period')}>Keyingi davrdan ({sub.nextBillingOn ?? '—'})</Button>
            <Button type="button" variant={effective === 'now' ? 'default' : 'outline'} size="sm" onClick={() => setEffective('now')}>Hozirdan (faqat oshirish)</Button>
          </div>
          <ItemsEditor projectId={projectId} currency={sub.currency} at={at} rows={rows} onChange={setRows} />
          <Field label="Sabab"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Yangi filial ochildi…" /></Field>
        </div>
        <DialogFooter><Button disabled={!toItems(rows).length || m.isPending} onClick={() => m.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
