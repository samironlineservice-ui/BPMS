import type { FieldError } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function Field({ label, error, hint, children, className, required }: {
  label: React.ReactNode; error?: FieldError | string; hint?: React.ReactNode; children: React.ReactNode; className?: string; required?: boolean;
}) {
  const msg = typeof error === 'string' ? error : error?.message;
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
      {msg ? <p className="text-xs text-destructive">{msg}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
