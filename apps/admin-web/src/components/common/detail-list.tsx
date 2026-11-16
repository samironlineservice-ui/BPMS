import { cn } from '@/lib/utils';

/** Kalit–qiymat ro'yxati (kartochkalardagi rekvizitlar uchun). */
export function DetailList({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v === null || v === undefined || v === '' ? <span className="text-muted-foreground">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}
