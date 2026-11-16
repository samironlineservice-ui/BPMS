import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FileDown, Printer } from 'lucide-react';
import { useState } from 'react';
import type { StatementDto } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { date, todayTashkent } from '@/lib/format';
import { meQuery, requireAccess } from '@/lib/session';

export const Route = createFileRoute('/_app/statement')({ beforeLoad: requireAccess('finance'), component: Statement });

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
function presets(today: string): [string, string, string][] {
  const y = Number(today.slice(0, 4)); const m = Number(today.slice(5, 7)) - 1; const q = Math.floor(m / 3) * 3;
  return [
    ['Joriy oy', iso(y, m, 1), today],
    ["O'tgan oy", iso(y, m - 1, 1), iso(y, m, 0)],
    ['Joriy chorak', iso(y, q, 1), today],
    ['Yil boshidan', iso(y, 0, 1), today],
    ["O'tgan yil", iso(y - 1, 0, 1), iso(y - 1, 11, 31)],
  ];
}

function Statement() {
  const { data: me } = useQuery(meQuery);
  const today = todayTashkent();
  const [currency, setCurrency] = useState(me?.client.billingCurrency ?? 'UZS');
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const valid = !!from && !!to && from <= to;
  const { data, isLoading } = useQuery({ queryKey: ['statement', currency, from, to], queryFn: () => api.get<StatementDto>('/statement', { currency, from, to }), enabled: valid });
  const pdfUrl = `/api/v1/portal/statement/pdf?currency=${currency}&from=${from}&to=${to}`;
  const closing = data ? BigInt(data.closingMinor) : 0n;
  return (
    <>
      <PageHeader
        title="Akt-sverka" description="O'zaro hisob-kitoblarni solishtirish dalolatnomasi — buxgalteriyangiz uchun"
        actions={<>
          <Button variant="outline" onClick={() => window.print()} disabled={!data}><Printer className="mr-2 size-4" />Chop etish</Button>
          <Button asChild disabled={!valid}><a href={pdfUrl} target="_blank" rel="noreferrer"><FileDown className="mr-2 size-4" />PDF (imzo uchun)</a></Button>
        </>}
      />
      <div className="mb-3 flex flex-wrap gap-1.5 print:hidden">
        {presets(today).map(([label, f, t]) => (
          <Button key={label} size="sm" variant={from === f && to === t ? 'secondary' : 'ghost'} onClick={() => { setFrom(f); setTo(t); }}>{label}</Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Valyuta"><Select value={currency} onValueChange={setCurrency}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></Field>
        <Field label="Dan"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Gacha"><Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {!valid && <p className="text-sm text-destructive">Boshlanish sanasi tugash sanasidan keyin bo'lmasin.</p>}
      {isLoading && <Skeleton className="h-48" />}
      {data && (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b p-4">
            <div><div className="font-semibold">{data.client.name}</div><div className="text-sm text-muted-foreground">{data.currency} · {date(data.from)} — {date(data.to)}</div></div>
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Yakuniy holat</div>
              <div className="font-semibold">{closing > 0n ? <>Qarzingiz: <Money minor={data.closingMinor} currency={data.currency} /></> : closing < 0n ? <>Avansingiz: <Money minor={data.closingMinor.slice(1)} currency={data.currency} /></> : "O'zaro qarz yo'q"}</div>
            </div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Sana</TableHead><TableHead>Hujjat</TableHead><TableHead className="text-right">Debet</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Qoldiq</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40"><TableCell colSpan={4}>Boshlang'ich qoldiq</TableCell><TableCell className="text-right"><Money minor={data.openingMinor} currency={data.currency} /></TableCell></TableRow>
              {data.lines.map((l, k) => (
                <TableRow key={k}>
                  <TableCell className="text-sm">{date(l.date)}</TableCell>
                  <TableCell className="text-sm"><span className="font-mono text-xs">{l.ref}</span><div className="text-xs text-muted-foreground">{l.description}</div></TableCell>
                  <TableCell className="text-right">{l.debitMinor !== '0' && <Money minor={l.debitMinor} currency={data.currency} />}</TableCell>
                  <TableCell className="text-right">{l.creditMinor !== '0' && <Money minor={l.creditMinor} currency={data.currency} />}</TableCell>
                  <TableCell className="text-right"><Money minor={l.balanceMinor} currency={data.currency} /></TableCell>
                </TableRow>
              ))}
              {!data.lines.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Bu davrda harakat yo'q</TableCell></TableRow>}
            </TableBody>
            <TableFooter>
              <TableRow><TableCell colSpan={2}>Davr aylanmasi</TableCell><TableCell className="text-right"><Money minor={data.debitTotalMinor} currency={data.currency} /></TableCell><TableCell className="text-right"><Money minor={data.creditTotalMinor} currency={data.currency} /></TableCell><TableCell /></TableRow>
              <TableRow><TableCell colSpan={4} className="font-semibold">Yakuniy qoldiq</TableCell><TableCell className="text-right font-semibold"><Money minor={data.closingMinor} currency={data.currency} /></TableCell></TableRow>
            </TableFooter>
          </Table>
          <p className="px-4 py-3 text-xs text-muted-foreground">Qoldiq: musbat — sizning qarzingiz, manfiy — avans (oldindan to'lov). Debet — hisoblangan xizmatlar, kredit — to'lovlar va tuzatishlar.</p>
        </Card>
      )}
    </>
  );
}
