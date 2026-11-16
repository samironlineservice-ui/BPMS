import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { PayStartResult } from '@ads/contracts';
import { Money } from '@/components/common/money';
import { MethodPicker } from '@/components/pay/method-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api, errorText } from '@/lib/api';
import { choiceBody, openPayment, type PayChoice } from '@/lib/pay';

type Inv = { id: string; number: string | null; outstandingMinor: string; currency: string };

/** Tanlangan (yoki barcha ochiq) invoice'larni onlayn to'lash: usul tanlash → provayder sahifasi yoki karta. */
export function PayInvoicesButton({ invoices, label = "Onlayn to'lash", size, variant, className }: {
  invoices: Inv[]; label?: string; size?: 'sm' | 'default'; variant?: 'default' | 'outline'; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PayChoice | null>(null);
  const router = useRouter();
  const list = invoices.filter((i) => i.outstandingMinor !== '0').slice(0, 20);
  const totals = Object.entries(list.reduce<Record<string, bigint>>((a, i) => ({ ...a, [i.currency]: (a[i.currency] ?? 0n) + BigInt(i.outstandingMinor) }), {}));
  const m = useMutation({
    mutationFn: () => api.post<PayStartResult>('/invoices/pay', { invoiceIds: list.map((i) => i.id), ...choiceBody(choice!) }),
    onSuccess: (r) => { setOpen(false); openPayment(r, (p) => router.history.push(p)); },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!list.length) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setChoice(null); }}>
      <DialogTrigger asChild><Button size={size} variant={variant} className={className}><CreditCard className="mr-2 size-4" />{label}</Button></DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Onlayn to'lash</DialogTitle>
          <DialogDescription>{list.length === 1 ? `${list[0]!.number ?? 'Invoice'} bo'yicha qoldiq` : `${list.length} ta invoice bo'yicha qoldiq`}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4">
          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            {totals.map(([cur, sum]) => <div key={cur} className="flex justify-between"><span className="text-muted-foreground">Summa</span><Money minor={sum.toString()} currency={cur} className="font-semibold" /></div>)}
            {totals.some(([cur]) => cur === 'USD') && <p className="mt-1 text-xs text-muted-foreground">Dollardagi invoice so'mda — bugungi Markaziy bank kursi bo'yicha to'lanadi.</p>}
          </div>
          <MethodPicker value={choice} onChange={setChoice} />
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />Karta ma'lumotlari faqat to'lov tizimida qayta ishlanadi. To'lov tushgach, invoice avtomatik yopiladi.</p>
        </div>
        <DialogFooter><Button className="w-full sm:w-auto" disabled={!choice || m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Yuborilmoqda…' : "To'lashga o'tish"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
