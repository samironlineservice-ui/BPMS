import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCan } from '@/lib/auth';
import { NAV } from './nav';

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const can = useCan();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', on);
    const openEvt = () => setOpen(true);
    window.addEventListener('ads:command', openEvt);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('ads:command', openEvt); };
  }, []);
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Qidiruv" description="Sahifa yoki amalni tanlang">
      <CommandInput placeholder="Qidirish yoki o'tish…" />
      <CommandList>
        <CommandEmpty>Hech narsa topilmadi</CommandEmpty>
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <CommandGroup key={g.title} heading={g.title}>
              {items.map((i) => (
                <CommandItem key={i.to} onSelect={() => { setOpen(false); void navigate({ to: i.to }); }}>
                  <i.icon className="mr-2 size-4" />
                  {i.title}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
