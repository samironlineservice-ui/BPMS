import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CloudDownload, Lock, Play, Plus, RefreshCcw, Siren } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Confirm } from '@/components/common/confirm';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { date, dateTime } from '@/lib/format';
import { fxRatesQuery, MONEY_KEYS, periodsQuery, runsQuery, todayIso, trialBalanceQuery } from '@/features/billing/api';
import { StatementView } from '@/features/billing/statement';

const search = z.object({ tab: z.string().catch('statement').default('statement') });
export const Route = createFileRoute('/_app/finance/')({ validateSearch: search, component: FinancePage });

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const ACCOUNT_TYPES: Record<string, string> = { ASSET: 'Aktiv', LIABILITY: 'Majburiyat', EQUITY: 'Kapital', REVENUE: 'Daromad', EXPENSE: 'Xarajat' };

function useAct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (x: { path: string; body?: unknown; ok: string }) => api.post(x.path, x.body ?? {}).then(() => x.ok),
    onSuccess: (ok) => { toast.success(ok); for (const k of [...MONEY_KEYS, ['fx'], ['periods'], ['billing-runs'], ['journal']]) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => handleApiError(e),
  });
}

function Rates() {
  const { data } = useQuery(fxRatesQuery);
  const can = useCan();
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(todayIso()); const [rate, setRate] = useState('');
  return (
    <div className="grid gap-3">
      {can('finance:manage_fx') && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ path: '/finance/fx-rates/fetch', ok: "MB kursi yuklandi" })}><CloudDownload className="mr-2 size-4" />MB (CBU) kursini yuklash</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="outline"><Plus className="mr-2 size-4" />Qo'lda kiritish</Button></DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>Kursni qo'lda kiritish</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <Field label="Sana"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
                <Field label="1 USD = ? so'm"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="12100.50" /></Field>
              </div>
              <DialogFooter><Button disabled={!rate || act.isPending} onClick={() => act.mutate({ path: '/finance/fx-rates', body: { date: d, rate: rate.replace(',', '.') }, ok: 'Kurs saqlandi' }, { onSuccess: () => setOpen(false) })}>Saqlash</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Sana</TableHead><TableHead className="text-right">1 USD</TableHead><TableHead>Manba</TableHead><TableHead>Kiritgan</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((r) => (
              <TableRow key={r.id}><TableCell>{date(r.date)}</TableCell><TableCell className="text-right font-mono">{r.rate} so'm</TableCell>
                <TableCell><Badge variant={r.source === 'CBU' ? 'secondary' : 'outline'}>{r.source === 'CBU' ? 'Markaziy bank' : "Qo'lda"}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.createdBy ?? dateTime(r.fetchedAt)}</TableCell></TableRow>
            ))}
            {data && !data.length && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Kurslar yo'q</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Periods() {
  const { data } = useQuery(periodsQuery);
  const can = useCan();
  const act = useAct();
  const current = todayIso().slice(0, 7);
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader><TableRow><TableHead>Oy</TableHead><TableHead className="text-right">Yozuvlar</TableHead><TableHead>Kurs farqi qayta baholash</TableHead><TableHead>Holat</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data?.map((p) => (
            <TableRow key={p.month}>
              <TableCell className="font-medium capitalize">{monthLabel(p.month)}</TableCell>
              <TableCell className="text-right">{p.entries}</TableCell>
              <TableCell className="text-sm">{p.fxRevaluedAt ? dateTime(p.fxRevaluedAt) : <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>{p.closedAt ? <Badge variant="secondary"><Lock className="mr-1 size-3" />Yopilgan · {p.closedBy}</Badge> : <Badge variant="outline">Ochiq</Badge>}</TableCell>
              <TableCell className="text-right">
                {!p.closedAt && can('finance:close_period') && (
                  <div className="flex justify-end gap-2">
                    {!p.fxRevaluedAt && (
                      <Confirm title={`${monthLabel(p.month)}: USD qarzni qayta baholash`} description="Ochiq USD debitorlik oy oxiri MB kursida qayta baholanadi (7150/7250), 1-sanada avtomatik teskari yoziladi."
                        trigger={<Button size="sm" variant="outline"><RefreshCcw className="mr-1 size-4" />Qayta baholash</Button>}
                        onConfirm={() => act.mutateAsync({ path: `/billing/periods/${p.month}/revalue`, ok: 'Qayta baholandi' })} />
                    )}
                    {p.fxRevaluedAt && p.month.slice(0, 7) < current && (
                      <Confirm destructive title={`${monthLabel(p.month)} ni yopish`} description="Yopilgan oyga hech qanday yozuv kiritib bo'lmaydi (to'lov, invoice, tuzatish)." confirmText="Yopish"
                        trigger={<Button size="sm"><Lock className="mr-1 size-4" />Yopish</Button>}
                        onConfirm={() => act.mutateAsync({ path: `/billing/periods/${p.month}/close`, ok: 'Oy yopildi' })} />
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TrialBalance() {
  const [asOf, setAsOf] = useState(todayIso());
  const { data } = useQuery(trialBalanceQuery(asOf));
  const sum = (k: 'debitUzsMinor' | 'creditUzsMinor' | 'balanceUzsMinor') => (data ?? []).reduce((s, r) => s + BigInt(r[k]), 0n);
  return (
    <div className="grid gap-3">
      <Field label="Sana holatiga" className="w-48"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Hisob</TableHead><TableHead>Turi</TableHead><TableHead className="text-right">Debet</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Qoldiq</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((r) => (
              <TableRow key={r.code} className={r.debitUzsMinor === '0' && r.creditUzsMinor === '0' ? 'text-muted-foreground' : undefined}>
                <TableCell><span className="font-mono text-xs">{r.code}</span> {r.name}</TableCell>
                <TableCell className="text-sm">{ACCOUNT_TYPES[r.type] ?? r.type}</TableCell>
                <TableCell className="text-right"><Money minor={r.debitUzsMinor} currency="UZS" /></TableCell>
                <TableCell className="text-right"><Money minor={r.creditUzsMinor} currency="UZS" /></TableCell>
                <TableCell className="text-right font-medium"><Money minor={r.balanceUzsMinor} currency="UZS" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow><TableCell colSpan={2}>Jami {sum('balanceUzsMinor') === 0n ? <Badge variant="secondary" className="ml-2">balanslangan ✓</Badge> : <Badge variant="destructive" className="ml-2">balanslanmagan!</Badge>}</TableCell>
              <TableCell className="text-right"><Money minor={sum('debitUzsMinor')} currency="UZS" /></TableCell><TableCell className="text-right"><Money minor={sum('creditUzsMinor')} currency="UZS" /></TableCell>
              <TableCell className="text-right"><Money minor={sum('balanceUzsMinor')} currency="UZS" /></TableCell></TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

function Billing() {
  const { data } = useQuery(runsQuery);
  const can = useCan();
  const act = useAct();
  return (
    <div className="grid gap-3">
      {can('invoices:issue') && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ path: '/billing/run', ok: 'Billing bajarildi' })}><Play className="mr-2 size-4" />Billing'ni hozir ishga tushirish</Button>
          <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ path: '/billing/dunning', ok: 'Qarzdorlik tekshirildi' })}><Siren className="mr-2 size-4" />Qarzdorlikni tekshirish (dunning)</Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Avtomatik: billing har kuni 00:10 da, dunning 09:00 da, MB kursi 09:00/12:00/17:00 da (Toshkent vaqti).</p>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Sana</TableHead><TableHead>Holat</TableHead><TableHead className="text-right">Obunalar</TableHead><TableHead className="text-right">Invoice</TableHead><TableHead className="text-right">Xato</TableHead><TableHead>Tugadi</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{date(r.runDate)}</TableCell>
                <TableCell><StatusBadge status={r.status === 'COMPLETED_WITH_ERRORS' ? 'FAILED' : r.status} label={r.status === 'COMPLETED_WITH_ERRORS' ? 'Xatolar bilan' : undefined} />
                  {Array.isArray(r.errors) && r.errors.length > 0 && <div className="mt-1 max-w-md text-xs text-destructive">{(r.errors as { code: string; error: string }[]).map((e) => `${e.code}: ${e.error}`).join('; ')}</div>}</TableCell>
                <TableCell className="text-right">{r.enqueued}</TableCell><TableCell className="text-right">{r.invoiced}</TableCell><TableCell className="text-right">{r.failed}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{dateTime(r.finishedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface JournalPage { total: number; page: number; pageSize: number; items: { id: string; date: string; sourceType: string; description: string | null; postedAt: string; lines: { account: string; accountName: string; currency: string; amountMinor: string; amountUzsMinor: string }[] }[] }
function Journal() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['journal', page], queryFn: () => api.get<JournalPage>('/finance/journal', { page, pageSize: 20 }) });
  return (
    <div className="grid gap-3">
      {data?.items.map((e) => (
        <div key={e.id} className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{date(e.date)}</span><Badge variant="outline">{e.sourceType}</Badge><span className="text-muted-foreground">{e.description}</span></div>
          <div className="grid gap-1 text-xs">
            {e.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-4">
                <span><span className="font-mono">{l.account}</span> {l.accountName}</span>
                <Money minor={l.amountMinor} currency={l.currency} className={l.amountMinor.startsWith('-') ? '' : 'font-medium'} />
                <span className="w-36 text-right text-muted-foreground">{l.currency !== 'UZS' && <Money minor={l.amountUzsMinor} currency="UZS" muted />}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {data && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Oldingi</Button>
          <span>{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
          <Button size="sm" variant="outline" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Keyingi</Button>
        </div>
      )}
    </div>
  );
}

function FinancePage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader title="Moliya" description="Akt-sverka, valyuta kurslari, oy yopish, aylanma-saldo va billing jurnali" />
      <Tabs value={tab} onValueChange={(t) => navigate({ search: { tab: t } })}>
        <TabsList className="flex-wrap print:hidden">
          <TabsTrigger value="statement">Akt-sverka</TabsTrigger>
          <TabsTrigger value="rates">Kurslar</TabsTrigger>
          <TabsTrigger value="periods">Davrlar</TabsTrigger>
          <TabsTrigger value="tb">Aylanma-saldo</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="journal">Jurnal</TabsTrigger>
        </TabsList>
        <TabsContent value="statement"><StatementView /></TabsContent>
        <TabsContent value="rates"><Rates /></TabsContent>
        <TabsContent value="periods"><Periods /></TabsContent>
        <TabsContent value="tb"><TrialBalance /></TabsContent>
        <TabsContent value="billing"><Billing /></TabsContent>
        <TabsContent value="journal"><Journal /></TabsContent>
      </Tabs>
    </>
  );
}
