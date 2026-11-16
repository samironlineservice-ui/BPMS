import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { CopyButton } from '@/components/common/copy-button';
import { Money } from '@/components/common/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { companyQuery, meQuery } from '@/lib/session';

/** Qanday to'lash: bank rekvizitlari + to'lov maqsadi (invoice raqami bilan) — nusxalash tugmalari bilan. */
export function PayInstructions({ invoiceNumber, amountMinor, currency, compact }: { invoiceNumber?: string | null; amountMinor?: string; currency?: string; compact?: boolean }) {
  const { data: c } = useQuery(companyQuery);
  const { data: me } = useQuery(meQuery);
  const who = me ? ` (${me.client.legalName}, shaxsiy hisob ${me.client.accountNo})` : '';
  const purpose = invoiceNumber ? `${invoiceNumber} hisob-fakturasi bo'yicha to'lov${who}` : `Xizmatlar uchun to'lov${who}`;
  const rows: [string, string | null | undefined, boolean][] = [
    ['Oluvchi', c?.legalName ?? c?.name, false], ['STIR', c?.tin, true], ['Bank', c?.bankName, false], ['MFO', c?.bankMfo, true], ['Hisob raqami', c?.bankAccount, true],
  ];
  const known = rows.filter(([, v]) => v);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Landmark className="size-4 text-muted-foreground" />Qanday to'lash mumkin</CardTitle>
        {!compact && <CardDescription>Bank o'tkazmasi orqali. To'lov tushgach, u avtomatik ravishda eng eski to'lanmagan invoice'ga taqsimlanadi.</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {known.length > 0 ? (
          <dl className="grid gap-1">
            {known.map(([k, v, mono]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="flex items-center gap-1 text-right font-medium"><span className={mono ? 'font-mono' : undefined}>{v}</span><CopyButton text={String(v)} /></dd>
              </div>
            ))}
          </dl>
        ) : <p className="text-muted-foreground">Rekvizitlar invoice PDF'ida ko'rsatilgan.</p>}
        {amountMinor && currency && (
          <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"><span className="text-muted-foreground">Summa</span><Money minor={amountMinor} currency={currency} className="font-semibold" /></div>
        )}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>To'lov maqsadi</span><CopyButton text={purpose} label="Nusxalash" /></div>
          <p className="text-sm">{purpose}</p>
        </div>
        {currency === 'USD' && <p className="text-xs text-muted-foreground">Dollardagi invoice so'mda, to'lov kunidagi Markaziy bank kursi bo'yicha to'lanadi.</p>}
        {me && (
          <p className="text-xs text-muted-foreground">
            Onlayn: «Onlayn to'lash» tugmasi (Payme, Click, Uzum Bank yoki saqlangan karta) yoki ilova/Paynet terminalida shaxsiy hisob raqami bilan:{' '}
            <span className="font-mono font-medium text-foreground">{me.client.accountNo}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
