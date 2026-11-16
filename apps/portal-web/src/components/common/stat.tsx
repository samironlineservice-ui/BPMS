import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** KPI kartasi: sarlavha, asosiy qiymat, izoh. */
export function Stat({ label, value, hint, tone, icon: Icon }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'danger' | 'warning'; icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className={cn(tone === 'danger' && 'border-destructive/40', tone === 'warning' && 'border-warning/50')}>
      <CardHeader className="pb-1">
        <CardDescription className="flex items-center gap-1.5">{Icon && <Icon className="size-3.5" />}{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

/** Bo'sh holat: ikonka, sarlavha, izoh, amal. */
export function Empty({ icon: Icon, title, text, action }: { icon: React.ComponentType<{ className?: string }>; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <Icon className="size-8 text-muted-foreground/60" />
      <div className="font-medium">{title}</div>
      {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
