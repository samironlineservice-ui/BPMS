import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export function Money({ minor, currency, className, muted }: { minor: string | number | bigint | null | undefined; currency: string; className?: string; muted?: boolean }) {
  if (minor === null || minor === undefined) return <span className="text-muted-foreground">—</span>;
  const neg = String(minor).startsWith('-');
  return <span className={cn('tabular-nums whitespace-nowrap', neg && 'text-destructive', muted && 'text-muted-foreground', className)}>{money(minor, currency)}</span>;
}
