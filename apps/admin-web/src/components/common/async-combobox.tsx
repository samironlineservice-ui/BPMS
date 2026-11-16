import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ComboItem { id: string; label: string; sub?: string }

/** Server tomonda qidiriladigan tanlash maydoni (mijoz, qurilma va h.k.). */
export function AsyncCombobox({ value, label, onChange, fetcher, queryKey, placeholder = 'Tanlang…', emptyText = 'Topilmadi', disabled }: {
  value: string | null | undefined; label?: string | null; onChange: (item: ComboItem | null) => void;
  fetcher: (q: string) => Promise<ComboItem[]>; queryKey: string; placeholder?: string; emptyText?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<ComboItem | null>(null);
  useEffect(() => { const t = setTimeout(() => setTerm(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, isFetching } = useQuery({ queryKey: ['combo', queryKey, term], queryFn: () => fetcher(term), enabled: open });
  const shown = picked && picked.id === value ? picked.label : label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? (shown ?? '…') : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Qidirish…" />
          <CommandList>
            <CommandEmpty>{isFetching ? 'Yuklanmoqda…' : emptyText}</CommandEmpty>
            <CommandGroup>
              {data?.map((it) => (
                <CommandItem key={it.id} value={it.id} onSelect={() => { setPicked(it); onChange(it); setOpen(false); }}>
                  <Check className={cn('size-4', value === it.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0">
                    <div className="truncate">{it.label}</div>
                    {it.sub && <div className="truncate text-xs text-muted-foreground">{it.sub}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
