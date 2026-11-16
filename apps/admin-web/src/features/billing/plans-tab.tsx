import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Tag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { PlanItem } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { date } from '@/lib/format';
import { INTERVAL_LABELS, plansQuery, todayIso } from './api';

function PlanDialog({ projectId, plan, trigger }: { projectId: string; plan?: PlanItem; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [interval, setInterval] = useState('1'); const [active, setActive] = useState(true);
  const [isPublic, setIsPublic] = useState(false); const [features, setFeatures] = useState(''); const [sortOrder, setSortOrder] = useState('100');
  const qc = useQueryClient();
  const catalog = () => ({ isPublic, features: features.split('\n').map((f) => f.trim()).filter(Boolean).slice(0, 12), sortOrder: Number(sortOrder) || 0 });
  const m = useMutation({
    mutationFn: () => (plan
      ? api.put(`/plans/${plan.id}`, { name, description, isActive: active, ...catalog() })
      : api.post('/plans', { projectId, code, name, description, intervalMonths: Number(interval), isActive: active, ...catalog() })),
    onSuccess: () => { toast.success('Saqlandi'); setOpen(false); void qc.invalidateQueries({ queryKey: ['plans'] }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) {
        setCode(plan?.code ?? ''); setName(plan?.name ?? ''); setDescription(plan?.description ?? ''); setInterval(String(plan?.intervalMonths ?? 1)); setActive(plan?.isActive ?? true);
        setIsPublic(plan?.isPublic ?? false); setFeatures((plan?.features ?? []).join('\n')); setSortOrder(String(plan?.sortOrder ?? 100));
      }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{plan ? 'Tarifni tahrirlash' : 'Yangi tarif'}</DialogTitle><DialogDescription>Narxlar alohida qo'shiladi (valyuta va amal qilish sanasi bilan).</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nomi" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standart" /></Field>
            <Field label="Kod" required><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!plan} className="font-mono" placeholder="standart" /></Field>
          </div>
          <Field label="To'lov davri">
            <Select value={interval} onValueChange={setInterval} disabled={!!plan}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(INTERVAL_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l} ({k} oy)</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Tavsif"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <label className="flex items-center justify-between text-sm">Faol (yangi obunalarda tanlash mumkin)<Switch checked={active} onCheckedChange={setActive} /></label>
          <div className="grid gap-3 rounded-md border p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Mijoz kabinetidagi katalogda ko'rsatish<span className="block text-xs text-muted-foreground">Mijoz tarifni o'zi tanlab, onlayn to'lab obuna bo'ladi (faqat so'mdagi narx)</span></span>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </label>
            {isPublic && (
              <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                <Field label="Imkoniyatlar (har qatorda bittasi)"><Textarea rows={3} value={features} onChange={(e) => setFeatures(e.target.value)} placeholder={'1 ta filial\nTexnik yordam 9:00–18:00'} /></Field>
                <Field label="Tartib" hint="Kichigi oldinda"><Input inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ''))} /></Field>
              </div>
            )}
          </div>
        </div>
        <DialogFooter><Button disabled={!name || (!plan && !code) || m.isPending} onClick={() => m.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceDialog({ plan, trigger }: { plan: PlanItem; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState('UZS'); const [amount, setAmount] = useState(''); const [vat, setVat] = useState('0');
  const [from, setFrom] = useState(todayIso()); const [ikpu, setIkpu] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post(`/plans/${plan.id}/prices`, { currency, unitAmount: amount.replace(/\s/g, '').replace(',', '.'), vatRateBp: Math.round(Number(vat) * 100), validFrom: from, ikpuCode: ikpu || null }),
    onSuccess: () => { toast.success("Narx qo'shildi"); setOpen(false); setAmount(''); void qc.invalidateQueries({ queryKey: ['plans'] }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan.name}: yangi narx</DialogTitle>
          <DialogDescription>Joriy narx shu sanada yopiladi. Mavjud obunalar o'z narxida qoladi.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valyuta">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label={`Narx (${INTERVAL_LABELS[plan.intervalMonths]}, 1 dona)`} required><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500000" /></Field>
          <Field label="Amal qilish boshlanishi"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="QQS, %" hint="Hozircha firma yo'q — 0"><Input inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} /></Field>
          <Field label="IKPU (ixtiyoriy)" className="sm:col-span-2"><Input value={ikpu} onChange={(e) => setIkpu(e.target.value)} maxLength={17} className="font-mono" /></Field>
        </div>
        <DialogFooter><Button disabled={!amount || m.isPending} onClick={() => m.mutate()}>Qo'shish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlansTab({ projectId }: { projectId: string }) {
  const { data } = useQuery(plansQuery(projectId));
  const can = useCan();
  const manage = can('plans:manage');
  return (
    <div className="grid gap-4">
      {manage && <div><PlanDialog projectId={projectId} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Yangi tarif</Button>} /></div>}
      {data?.map((p) => (
        <Card key={p.id} className={p.isActive ? undefined : 'opacity-70'}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Tag className="size-4 text-primary" />{p.name}
                <Badge variant="outline">{INTERVAL_LABELS[p.intervalMonths]}</Badge>{!p.isActive && <Badge variant="secondary">nofaol</Badge>}
                {p.isPublic && <Badge variant="outline" className="border-primary/40 text-primary">katalogda</Badge>}</CardTitle>
              <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
              {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
              {p.isPublic && p.features.length > 0 && <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>}
            </div>
            {manage && (
              <div className="flex gap-1">
                <PriceDialog plan={p} trigger={<Button size="sm" variant="outline"><Plus className="mr-1 size-4" />Narx</Button>} />
                <PlanDialog projectId={projectId} plan={p} trigger={<Button size="icon" variant="ghost" aria-label="Tahrirlash"><Pencil className="size-4" /></Button>} />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Valyuta</TableHead><TableHead className="text-right">Narx</TableHead><TableHead>QQS</TableHead><TableHead>Amal qiladi</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {p.prices.map((x) => (
                  <TableRow key={x.id} className={x.validTo && x.validTo <= todayIso() ? 'text-muted-foreground' : undefined}>
                    <TableCell>{x.currency}</TableCell>
                    <TableCell className="text-right"><Money minor={x.unitAmountMinor} currency={x.currency} /></TableCell>
                    <TableCell>{x.vatRateBp ? `${x.vatRateBp / 100}%` : '—'}</TableCell>
                    <TableCell className="text-sm">{date(x.validFrom)} — {x.validTo ? date(x.validTo) : 'hozir'}</TableCell>
                    <TableCell>{x.inUse && <Badge variant="secondary">obunalarda</Badge>}</TableCell>
                  </TableRow>
                ))}
                {!p.prices.length && <TableRow><TableCell colSpan={5} className="py-4 text-center text-sm text-muted-foreground">Narx qo'shilmagan</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {data && !data.length && <p className="text-sm text-muted-foreground">Tariflar yo'q. Avval tarif yarating, keyin narx qo'shing.</p>}
    </div>
  );
}
