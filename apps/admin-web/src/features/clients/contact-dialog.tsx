import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type ContactItem, contactUpsertSchema, siteUpsertSchema, type SiteItem } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';

type CIn = z.input<typeof contactUpsertSchema>;
type COut = z.output<typeof contactUpsertSchema>;

export function ContactDialog({ clientId, contact, trigger }: { clientId: string; contact?: ContactItem; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const def: CIn = {
    fullName: contact?.fullName ?? '', position: contact?.position ?? '', phone: contact?.phone ?? '', email: contact?.email ?? '',
    telegram: contact?.telegram ?? '', isPrimary: contact?.isPrimary ?? false, isBilling: contact?.isBilling ?? false,
  };
  const form = useForm<CIn, unknown, COut>({ resolver: zodResolver(contactUpsertSchema), defaultValues: def });
  useEffect(() => { if (open) form.reset(def); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: (v: COut) => (contact ? api.patch(`/clients/${clientId}/contacts/${contact.id}`, v) : api.post(`/clients/${clientId}/contacts`, v)),
    onSuccess: () => { toast.success('Saqlandi'); setOpen(false); void qc.invalidateQueries({ queryKey: ['clients', clientId] }); },
    onError: (e) => handleApiError(e, form.setError),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{contact ? 'Kontaktni tahrirlash' : 'Yangi kontakt'}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <Field label="F.I.Sh." required error={e.fullName}><Input {...form.register('fullName')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lavozimi" error={e.position}><Input {...form.register('position')} placeholder="Direktor, buxgalter…" /></Field>
            <Field label="Telefon" error={e.phone}><Input {...form.register('phone')} /></Field>
            <Field label="Email" error={e.email}><Input type="email" {...form.register('email')} /></Field>
            <Field label="Telegram" error={e.telegram}><Input {...form.register('telegram')} placeholder="@username" /></Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><Controller control={form.control} name="isPrimary" render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />} />Asosiy kontakt</label>
            <label className="flex items-center gap-2"><Controller control={form.control} name="isBilling" render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />} />Hisob-fakturalar shu kishiga</label>
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Saqlash</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SIn = z.input<typeof siteUpsertSchema>;
type SOut = z.output<typeof siteUpsertSchema>;

export function SiteDialog({ clientId, site, trigger }: { clientId: string; site?: SiteItem; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const def: SIn = { name: site?.name ?? '', address: site?.address ?? '', region: site?.region ?? '', timezone: site?.timezone ?? 'Asia/Tashkent' };
  const form = useForm<SIn, unknown, SOut>({ resolver: zodResolver(siteUpsertSchema), defaultValues: def });
  useEffect(() => { if (open) form.reset(def); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: (v: SOut) => (site ? api.patch(`/clients/${clientId}/sites/${site.id}`, v) : api.post(`/clients/${clientId}/sites`, v)),
    onSuccess: () => { toast.success('Saqlandi'); setOpen(false); void qc.invalidateQueries({ queryKey: ['clients', clientId] }); },
    onError: (err) => handleApiError(err, form.setError),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{site ? 'Filialni tahrirlash' : 'Yangi filial / obyekt'}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <Field label="Nomi" required error={e.name}><Input {...form.register('name')} placeholder="Chilonzor filiali" /></Field>
          <Field label="Manzil" error={e.address}><Input {...form.register('address')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hudud" error={e.region}><Input {...form.register('region')} /></Field>
            <Field label="Vaqt zonasi" error={e.timezone}><Input {...form.register('timezone')} /></Field>
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Saqlash</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
