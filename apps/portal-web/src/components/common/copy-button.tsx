import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Matnni nusxalash (rekvizit, havola, to'lov maqsadi). */
export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button" variant="ghost" size={label ? 'sm' : 'icon'} className={cn(label ? 'h-7 px-2 text-xs' : 'size-7', className)} aria-label={label ?? 'Nusxalash'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success('Nusxalandi');
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Nusxalab bo'lmadi — qo'lda belgilang");
        }
      }}
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {label && <span className="ml-1">{label}</span>}
    </Button>
  );
}
