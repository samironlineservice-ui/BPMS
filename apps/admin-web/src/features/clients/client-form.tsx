import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type ClientDetail, clientUpsertSchema } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { TagInput } from '@/components/common/tag-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { CLIENT_STATUSES, clientTagsQuery, staffLookupQuery } from './api';

type FormIn = z.input<typeof clientUpsertSchema>;
type FormOut = z.output<typeof clientUpsertSchema>;

const masked = (v: string | null | undefined) => !!v && v.includes('*');
const toForm = (c?: ClientDetail): FormIn => ({
  type: (c?.type as FormIn['type']) ?? 'COMPANY', legalName: c?.legalName ?? '', displayName: c?.displayName ?? '',
  tin: c?.tin ?? '', pinfl: c && !masked(c.pinfl) ? (c.pinfl ?? '') : '', vatPayer: c?.vatPayer ?? false,
  legalAddress: c?.legalAddress ?? '', region: c?.region ?? '', bankName: c?.bankName ?? '', bankMfo: c?.bankMfo ?? '',
  bankAccount: c && !masked(c.bankAccount) ? (c.bankAccount ?? '') : '', billingEmail: c?.billingEmail ?? '', phone: c?.phone ?? '',
  preferredLocale: (c?.preferredLocale as FormIn['preferredLocale']) ?? 'uz', billingCurrency: (c?.billingCurrency as FormIn['billingCurrency']) ?? 'UZS',
  isResident: c?.isResident ?? true, status: (c?.status as FormIn['status']) ?? 'LEAD', accountManagerId: c?.accountManager?.id ?? '', tags: c?.tags ?? [],
});

export function ClientFormSheet({ client, trigger }: { client?: ClientDetail; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const staff = useQuery({ ...staffLookupQuery, enabled: open });
  const tags = useQuery({ ...clientTagsQuery, enabled: open });
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(clientUpsertSchema), defaultValues: toForm(client) });
  const { register, control, formState: { errors } } = form;
  useEffect(() => { if (open) form.reset(toForm(client)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMutation({
    mutationFn: async (v: FormOut) => {
      if (!client) return api.post<{ id: string; code: string }>('/clients', v);
      const body: Partial<FormOut> & { rowVersion: number } = { ...v, rowVersion: client.rowVersion };
      if (masked(client.pinfl) && !v.pinfl) delete body.pinfl; // ko'rinmagan maxfiy qiymat o'chirib yuborilmasin
      if (masked(client.bankAccount) && !v.bankAccount) delete body.bankAccount;
      await api.patch(`/clients/${client.id}`, body);
      return { id: client.id, code: client.code };
    },
    onSuccess: (r) => {
      toast.success(client ? 'Saqlandi' : `Mijoz yaratildi: ${r.code}`);
      void qc.invalidateQueries({ queryKey: ['clients'] });
      setOpen(false);
      if (!client) void navigate({ to: '/clients/$clientId', params: { clientId: r.id } });
    },
    onError: (e) => handleApiError(e, form.setError),
  });

  const type = form.watch('type');
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{client ? 'Mijozni tahrirlash' : 'Yangi mijoz'}</SheetTitle>
          <SheetDescription>{client ? `${client.code} · ${client.legalName}` : 'Kod va shaxsiy hisob raqami avtomatik beriladi'}</SheetDescription>
        </SheetHeader>
        <form id="client-form" className="grid gap-4 px-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Turi" required>
              <Controller control={control} name="type" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="COMPANY">Yuridik shaxs</SelectItem><SelectItem value="INDIVIDUAL">Jismoniy shaxs</SelectItem></SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="Holat">
              <Controller control={control} name="status" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLIENT_STATUSES.filter(([k]) => k !== 'ARCHIVED').map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
          </div>
          <Field label="Ko'rinadigan nomi" required error={errors.displayName}><Input {...register('displayName')} placeholder="Navro'z Savdo" /></Field>
          <Field label={type === 'COMPANY' ? 'Yuridik nomi' : 'F.I.Sh.'} required error={errors.legalName}>
            <Input {...register('legalName')} placeholder={type === 'COMPANY' ? '"Navro\'z Savdo" MChJ' : 'Aliyev Vali Karimovich'} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="STIR (INN)" error={errors.tin}><Input inputMode="numeric" maxLength={9} {...register('tin')} /></Field>
            <Field label="JSHSHIR (PINFL)" error={errors.pinfl} hint={masked(client?.pinfl) ? `Saqlangan: ${client?.pinfl}. O'zgartirish uchun to'liq kiriting` : 'Shifrlangan holda saqlanadi'}>
              <Input inputMode="numeric" maxLength={14} {...register('pinfl')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mas'ul menejer">
              <Controller control={control} name="accountManagerId" render={({ field }) => (
                <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— tayinlanmagan —</SelectItem>
                    {staff.data?.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="Telefon" error={errors.phone}><Input {...register('phone')} placeholder="+998 90 123 45 67" /></Field>
          </div>
          <Field label="Teglar">
            <Controller control={control} name="tags" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} suggestions={tags.data} />} />
          </Field>
          <Separator />
          <p className="text-sm font-medium">Rekvizitlar</p>
          <Field label="Yuridik manzil" error={errors.legalAddress}><Input {...register('legalAddress')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hudud" error={errors.region}><Input {...register('region')} placeholder="Toshkent sh." /></Field>
            <Field label="Bank" error={errors.bankName}><Input {...register('bankName')} /></Field>
            <Field label="MFO" error={errors.bankMfo}><Input inputMode="numeric" maxLength={5} {...register('bankMfo')} /></Field>
            <Field label="Hisob raqami" error={errors.bankAccount} hint={masked(client?.bankAccount) ? `Saqlangan: ${client?.bankAccount}` : undefined}>
              <Input inputMode="numeric" maxLength={20} {...register('bankAccount')} />
            </Field>
          </div>
          <Separator />
          <p className="text-sm font-medium">Billing</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Billing email" error={errors.billingEmail}><Input type="email" {...register('billingEmail')} /></Field>
            <Field label="Hujjatlar tili">
              <Controller control={control} name="preferredLocale" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="uz">O'zbekcha</SelectItem><SelectItem value="ru">Ruscha</SelectItem><SelectItem value="en">Inglizcha</SelectItem></SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="Billing valyutasi">
              <Controller control={control} name="billingCurrency" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="UZS">UZS — so'm</SelectItem><SelectItem value="USD">USD — dollar</SelectItem></SelectContent>
                </Select>
              )} />
            </Field>
          </div>
          <div className="grid gap-3">
            <label className="flex items-center justify-between gap-4 text-sm">QQS to'lovchisi
              <Controller control={control} name="vatPayer" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />} />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">O'zbekiston rezidenti
              <Controller control={control} name="isResident" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />} />
            </label>
          </div>
        </form>
        <SheetFooter>
          <Button type="submit" form="client-form" disabled={m.isPending}>{client ? 'Saqlash' : 'Yaratish'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
