import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export function TagInput({ value, onChange, suggestions = [], placeholder = "Teg yozing va Enter bosing" }: {
  value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string;
}) {
  const [text, setText] = useState('');
  const listId = useId();
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, '');
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button type="button" className="rounded-sm opacity-60 hover:opacity-100" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`${t} tegini olib tashlash`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        list={listId} value={text} placeholder={placeholder}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}
