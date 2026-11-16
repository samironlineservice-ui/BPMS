import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortalDashboard } from '@ads/contracts';
import { compactMoney, money, monthName, monthShort } from '@/lib/format';

type History = NonNullable<PortalDashboard['finance']>['history'];
const SERIES = [
  { key: 'paid', label: "To'langan", color: 'var(--series-1)' },
  { key: 'out', label: "To'lanmagan", color: 'var(--series-2)' },
] as const;

function Swatch({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: color }} />;
}

/** Oylar kesimida hisoblangan summa: to'langan + to'lanmagan (ustma-ust). Faoliyatdan oldingi bo'sh oylar ko'rsatilmaydi. */
export function BillingChart({ history, currency }: { history: History; currency: string }) {
  const rows = history.filter((h) => h.currency === currency);
  const first = rows.findIndex((r) => r.invoicedMinor !== '0');
  const data = (first < 0 ? [] : rows.slice(Math.max(0, first - 1))).map((r) => ({ month: r.month, paid: Number(r.paidMinor), out: Number(r.outstandingMinor) }));
  if (!data.length) return <p className="py-10 text-center text-sm text-muted-foreground">Hali hisob-fakturalar yo'q</p>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><Swatch color={s.color} />{s.label}</span>)}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={monthShort} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => compactMoney(v, currency)} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={72} />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as { paid: number; out: number };
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="mb-1 font-medium text-popover-foreground">{monthName(String(label))}</div>
                  {SERIES.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-popover-foreground">
                      <Swatch color={s.color} /><span className="text-muted-foreground">{s.label}</span>
                      <span className="ml-auto pl-4 font-medium tabular-nums">{money(row[s.key], currency)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t pt-1 text-popover-foreground"><span className="text-muted-foreground">Jami</span><span className="font-medium tabular-nums">{money(row.paid + row.out, currency)}</span></div>
                </div>
              );
            }}
          />
          <Bar dataKey="paid" stackId="m" fill="var(--series-1)" stroke="var(--card)" strokeWidth={1} maxBarSize={34} />
          <Bar dataKey="out" stackId="m" fill="var(--series-2)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
