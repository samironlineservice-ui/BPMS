import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { inviteUserSchema, type InviteResult, type InviteUserInput } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { rolesQuery } from './api';

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button type="button" variant="outline" size="icon" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); toast.success('Nusxa olindi'); }}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const qc = useQueryClient();
  const roles = useQuery(rolesQuery);
  const form = useForm<InviteUserInput>({ resolver: zodResolver(inviteUserSchema) as never, defaultValues: { email: '', fullName: '', phone: '', roleKeys: [] } });
  const m = useMutation({
    mutationFn: (v: InviteUserInput) => api.post<InviteResult>('/users', v),
    onSuccess: (r) => { setResult(r); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => handleApiError(e, form.setError),
  });
  const roleKeys = form.watch('roleKeys');
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setResult(null); form.reset(); } }}>
      <DialogTrigger asChild><Button><UserPlus className="mr-2 size-4" />Taklif qilish</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xodimni taklif qilish</DialogTitle>
          <DialogDescription>Taklif havolasi 72 soat amal qiladi. Havolani xodimga yuboring.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="grid gap-3">
            <p className="text-sm"><b>{result.user.fullName}</b> uchun taklif havolasi:</p>
            <CopyField value={result.inviteUrl} />
            <DialogFooter><Button onClick={() => setOpen(false)}>Yopish</Button></DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
            <Field label="To'liq ism" required error={form.formState.errors.fullName}><Input {...form.register('fullName')} /></Field>
            <Field label="Email" required error={form.formState.errors.email}><Input type="email" {...form.register('email')} /></Field>
            <Field label="Telefon" error={form.formState.errors.phone}><Input {...form.register('phone')} placeholder="+998 90 123 45 67" /></Field>
            <Field label="Rollar">
              <div className="grid max-h-48 gap-1.5 overflow-auto rounded-md border p-2">
                {roles.data?.filter((r) => r.key !== 'super_admin').map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={roleKeys.includes(r.key)} onCheckedChange={(c) =>
                      form.setValue('roleKeys', c ? [...roleKeys, r.key] : roleKeys.filter((k) => k !== r.key))} />
                    {r.name}<span className="text-xs text-muted-foreground">{r.description}</span>
                  </label>
                ))}
              </div>
            </Field>
            <DialogFooter><Button type="submit" disabled={m.isPending}>Taklif yaratish</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
