import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Debounce'li qidiruv maydoni (URL'ni har harfda yangilamaslik uchun). */
export function SearchInput({ value, onChange, placeholder = 'Qidirish…', className, delay = 300 }: {
  value?: string; onChange: (v: string | undefined) => void; placeholder?: string; className?: string; delay?: number;
}) {
  const [text, setText] = useState(value ?? '');
  const first = useRef(true);
  useEffect(() => { setText(value ?? ''); }, [value]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { if ((value ?? '') !== text) onChange(text.trim() || undefined); }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}
