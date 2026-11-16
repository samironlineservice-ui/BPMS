import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { AsyncCombobox } from '@/components/common/async-combobox';
import { Field } from '@/components/common/field';
import { Money } from '@/components/common/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { date } from '@/lib/format';
import { searchClients } from '@/features/projects/api';
import { statementQuery, todayIso } from './api';

/** Akt-sverka (o'zaro hisob-kitob solishtirmasi): ledger'dan, mijoz × valyuta kesimida. Musbat qoldiq — mijoz qarzi. */
export function StatementView({ clientId: fixed }: { clientId?: string }) {
  const [clientId, setClientId] = useState(fixed ?? '');
  const [currency, setCurrency] = useState('UZS');
  const [from, setFrom] = useState(`${todayIso().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayIso());
  const { data, isLoading } = useQuery({ ...statementQuery({ clientId, currency, from, to }), enabled: !!clientId && from <= to });
  const balanceLabel = (minor: string) => (minor.startsWith('-') ? 'mijoz avansi' : minor === '0' ? '' : 'mijoz qarzi');
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {!fixed && <Field label="Mijoz" className="w-72"><AsyncCombobox value={clientId} onChange={(it) => setClientId(it?.id ?? '')} fetcher={searchClients} queryKey="clients" placeholder="Mijozni tanlang…" /></Field>}
        <Field label="Valyuta">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Dan"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Gacha"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Button variant="outline" disabled={!data} onClick={() => window.print()}><Printer className="mr-2 size-4" />Chop etish</Button>
      </div>
      {!clientId && <p className="text-sm text-muted-foreground">Mijozni tanlang.</p>}
      {isLoading && <Skeleton className="h-40" />}
      {data && (
        <div className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <div className="text-lg font-semibold">O'zaro hisob-kitoblarni solishtirish dalolatnomasi</div>
            <div className="text-sm text-muted-foreground">{data.client.name} ({data.client.code}) · {data.currency} · {date(data.from)} — {date(data.to)}</div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Sana</TableHead><TableHead>Hujjat</TableHead><TableHead>Mazmun</TableHead><TableHead className="text-right">Debet</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Qoldiq</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40"><TableCell colSpan={5} className="font-medium">Boshlang'ich qoldiq ({date(data.from)})</TableCell><TableCell className="text-right font-medium"><Money minor={data.openingMinor} currency={data.currency} /></TableCell></TableRow>
              {data.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-sm">{date(l.date)}</TableCell>
                  <TableCell className="font-mono text-xs">{l.ref}</TableCell>
                  <TableCell className="text-sm">{l.description}</TableCell>
                  <TableCell className="text-right">{l.debitMinor !== '0' && <Money minor={l.debitMinor} currency={data.currency} />}</TableCell>
                  <TableCell className="text-right">{l.creditMinor !== '0' && <Money minor={l.creditMinor} currency={data.currency} />}</TableCell>
                  <TableCell className="text-right"><Money minor={l.balanceMinor} currency={data.currency} /></TableCell>
                </TableRow>
              ))}
              {!data.lines.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Davrda harakat yo'q</TableCell></TableRow>}
            </TableBody>
            <TableFooter>
              <TableRow><TableCell colSpan={3}>Aylanma</TableCell><TableCell className="text-right"><Money minor={data.debitTotalMinor} currency={data.currency} /></TableCell><TableCell className="text-right"><Money minor={data.creditTotalMinor} currency={data.currency} /></TableCell><TableCell /></TableRow>
              <TableRow><TableCell colSpan={5} className="font-semibold">Yakuniy qoldiq ({date(data.to)}) {balanceLabel(data.closingMinor) && <span className="font-normal text-muted-foreground">— {balanceLabel(data.closingMinor)}</span>}</TableCell>
                <TableCell className="text-right font-semibold"><Money minor={data.closingMinor.replace('-', '')} currency={data.currency} /></TableCell></TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
