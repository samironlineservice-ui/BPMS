import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMe } from '@/lib/auth';
import { MODULE_LABELS, permissionsQuery } from '@/features/users/api';

/** Ruxsatlarni modul bo'yicha tanlash. Foydalanuvchida yo'q ruxsatlar o'chirilgan (berib bo'lmaydi). */
export function PermissionPicker({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { data: perms } = useQuery(permissionsQuery);
  const { data: me } = useMe();
  const mine = new Set(me?.permissions ?? []);
  const selected = new Set(value);
  const groups = new Map<string, NonNullable<typeof perms>>();
  for (const p of perms ?? []) groups.set(p.module, [...(groups.get(p.module) ?? []), p]);
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key); else next.delete(key);
    onChange([...next].sort());
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[...groups.entries()].map(([module, items]) => (
        <div key={module} className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{MODULE_LABELS[module] ?? module}</span>
            <span className="text-xs text-muted-foreground">{items.filter((i) => selected.has(i.key)).length}/{items.length}</span>
          </div>
          <div className="grid gap-1.5">
            {items.map((p) => {
              const cannot = !mine.has(p.key);
              return (
                <label key={p.key} className="flex items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" checked={selected.has(p.key)} disabled={disabled || (cannot && !selected.has(p.key))}
                    onCheckedChange={(c) => toggle(p.key, c === true)} />
                  <span className="flex-1 leading-tight">
                    {p.description}
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">{p.key}</span>
                  </span>
                  {p.sensitive && (
                    <Tooltip>
                      <TooltipTrigger asChild><ShieldAlert className="size-3.5 shrink-0 text-warning" /></TooltipTrigger>
                      <TooltipContent>Sezgir ruxsat — tasdiq/step-up talab qiladi</TooltipContent>
                    </Tooltip>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
