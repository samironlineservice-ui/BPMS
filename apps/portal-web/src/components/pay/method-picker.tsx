import { useQuery } from '@tanstack/react-query';
import { CreditCard, Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { GATEWAY_LABELS } from '@ads/contracts';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CARD_TYPE, cardsQuery, type PayChoice, payMethodsQuery, PROVIDER_HINT } from '@/lib/pay';
import { cn } from '@/lib/utils';

const same = (a: PayChoice | null, b: PayChoice) => !!a && a.method === b.method && (a.method !== 'CARD' || (b.method === 'CARD' && a.cardId === b.cardId));
const MODE_BADGE: Record<string, string> = { EMULATOR: 'sinov (emulyator)', TEST: 'sinov' };

function Option({ selected, onSelect, icon, title, subtitle, badge }: {
  selected: boolean; onSelect: () => void; icon: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; badge?: string;
}) {
  return (
    <button
      type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {badge && <Badge variant="outline" className="shrink-0 text-[10px]">{badge}</Badge>}
      <span aria-hidden className={cn('size-4 shrink-0 rounded-full border-2', selected ? 'border-[5px] border-primary' : 'border-muted-foreground/40')} />
    </button>
  );
}

/** To'lov usulini tanlash: saqlangan kartalar (bir bosishda) yoki to'lov tizimi sahifasi. */
export function MethodPicker({ value, onChange, withCards = true }: { value: PayChoice | null; onChange: (c: PayChoice) => void; withCards?: boolean }) {
  const methods = useQuery(payMethodsQuery);
  const cards = useQuery({ ...cardsQuery, enabled: withCards });
  const providers = (methods.data?.providers ?? []).filter((p) => p.key !== 'PAYNET');
  const saved = withCards ? cards.data ?? [] : [];

  // Standart tanlov: asosiy karta, bo'lmasa birinchi to'lov tizimi
  useEffect(() => {
    if (value || !methods.data || (withCards && !cards.data)) return;
    const def = saved.find((c) => c.isDefault);
    if (def) onChange({ method: 'CARD', cardId: def.id });
    else if (providers[0]) onChange({ method: providers[0].key as 'PAYME' | 'CLICK' | 'UZUM' });
  }, [value, methods.data, cards.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (methods.isLoading || (withCards && cards.isLoading)) return <Skeleton className="h-40" />;
  if (!providers.length && !saved.length) return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Onlayn to'lov hozircha ulanmagan. Bank o'tkazmasi orqali to'lashingiz mumkin.</p>;
  return (
    <div role="radiogroup" aria-label="To'lov usuli" className="grid min-w-0 gap-2">
      {saved.length > 0 && <div className="text-xs font-medium text-muted-foreground">Saqlangan kartalar</div>}
      {saved.map((c) => {
        const choice: PayChoice = { method: 'CARD', cardId: c.id };
        return (
          <Option key={c.id} selected={same(value, choice)} onSelect={() => onChange(choice)} icon={<CreditCard className="size-4" />}
            title={<span className="font-mono">{c.maskedPan}</span>}
            subtitle={`${c.cardType ? `${CARD_TYPE[c.cardType] ?? c.cardType} · ` : ''}${c.expire} · ${GATEWAY_LABELS[c.provider] ?? c.provider} orqali`}
            badge={c.isDefault ? 'asosiy' : undefined} />
        );
      })}
      {providers.length > 0 && <div className="mt-1 text-xs font-medium text-muted-foreground">To'lov tizimi orqali</div>}
      {providers.map((p) => {
        const choice = { method: p.key } as PayChoice;
        return (
          <Option key={p.key} selected={same(value, choice)} onSelect={() => onChange(choice)} icon={p.key === 'UZUM' ? <Wallet className="size-4" /> : p.label.slice(0, 1)}
            title={p.label} subtitle={PROVIDER_HINT[p.key]} badge={MODE_BADGE[p.mode]} />
        );
      })}
    </div>
  );
}
