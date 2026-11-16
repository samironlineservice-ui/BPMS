import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money } from '@/lib/format';

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
export const monthShort = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

/** O'qda qisqa: 1,5 mln / 820 ming (so'm). */
export function compactUzs(minor: number | string | bigint): string {
  const v = Number(minor) / 100;
  const f = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  if (Math.abs(v) >= 1e9) return `${f(v / 1e9)} mlrd`;
  if (Math.abs(v) >= 1e6) return `${f(v / 1e6)} mln`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} ming`;
  return String(Math.round(v));
}

/** Faoliyat boshlanishidan oldingi bo'sh oylar ko'rsatilmaydi (bitta nol oy boshlang'ich nuqta sifatida qoladi). */
export function sinceFirstActivity<T extends { mrrUzsMinor: string; invoicedUzsMinor: string; collectedUzsMinor: string }>(trend: T[]): T[] {
  const first = trend.findIndex((t) => t.mrrUzsMinor !== '0' || t.invoicedUzsMinor !== '0' || t.collectedUzsMinor !== '0');
  return first <= 1 ? trend : trend.slice(first - 1);
}

const axis = { stroke: 'var(--muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const;

function TipBox({ title, rows }: { title: string; rows: { label: string; color: string; value: string }[] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-popover-foreground">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: r.color }} />
          <span className="text-muted-foreground">{r.label}</span><span className="ml-auto pl-3 font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Bitta seriya (MRR) — sarlavha seriyani nomlaydi, legend kerak emas; crosshair + tooltip. */
export function MrrChart({ data }: { data: { month: string; mrrUzsMinor: string }[] }) {
  const rows = data.map((d) => ({ month: d.month, v: Number(d.mrrUzsMinor) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="month" tickFormatter={monthShort} {...axis} />
        <YAxis tickFormatter={compactUzs} width={56} {...axis} />
        <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
          content={({ active, payload, label }) => (active && payload?.length
            ? <TipBox title={monthShort(String(label))} rows={[{ label: 'MRR', color: 'var(--series-1)', value: money(payload[0]!.value as number, 'UZS') }]} />
            : null)} />
        <Area type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} fill="url(#mrrFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Ikki seriya: hisoblangan va tushum — legend + per-bar tooltip, barlar orasida 2px oraliq. */
export function CashChart({ data }: { data: { month: string; invoicedUzsMinor: string; collectedUzsMinor: string }[] }) {
  const rows = data.map((d) => ({ month: d.month, inv: Number(d.invoicedUzsMinor), col: Number(d.collectedUzsMinor) }));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-(--series-1)" />Hisoblangan (invoice)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-(--series-2)" />Tushum (to'lov)</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={monthShort} {...axis} />
          <YAxis tickFormatter={compactUzs} width={56} {...axis} />
          <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={({ active, payload, label }) => (active && payload?.length
              ? <TipBox title={monthShort(String(label))} rows={[
                { label: 'Hisoblangan', color: 'var(--series-1)', value: money(payload.find((p) => p.dataKey === 'inv')?.value as number, 'UZS') },
                { label: 'Tushum', color: 'var(--series-2)', value: money(payload.find((p) => p.dataKey === 'col')?.value as number, 'UZS') },
              ]} />
              : null)} />
          <Bar dataKey="inv" name="Hisoblangan" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="col" name="Tushum" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
