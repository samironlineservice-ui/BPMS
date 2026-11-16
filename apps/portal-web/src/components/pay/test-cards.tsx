import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { payMethodsQuery } from '@/lib/pay';

/** Emulyator rejimida: ommaviy sinov kartalari (bosilsa — maydonlar to'ldiriladi). Haqiqiy rejimda ko'rinmaydi. */
export function TestCards({ onPick }: { onPick: (c: { number: string; expire: string; smsCode: string }) => void }) {
  const { data } = useQuery(payMethodsQuery);
  if (!data?.testCards?.length) return null;
  return (
    <div className="rounded-md border border-dashed border-warning/50 bg-warning/5 p-3 text-xs">
      <div className="mb-2 flex items-center gap-1.5 font-medium"><FlaskConical className="size-3.5" />Sinov rejimi — haqiqiy pul yechilmaydi</div>
      <div className="flex flex-wrap gap-2">
        {data.testCards.map((c) => (
          <button key={c.number} type="button" onClick={() => onPick({ number: c.number, expire: c.expire, smsCode: data.testSmsCode ?? '' })}
            className="rounded border bg-background px-2 py-1 font-mono hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={c.note}>
            {c.number} · {c.expire}
          </button>
        ))}
      </div>
      {data.testSmsCode && <p className="mt-2 text-muted-foreground">SMS kod (sinov): <span className="font-mono text-foreground">{data.testSmsCode}</span></p>}
    </div>
  );
}

/** Karta raqami: 4 tadan guruhlab ko'rsatish. */
export const formatPan = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
/** Amal qilish muddati: OO/YY. */
export const formatExpire = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };
