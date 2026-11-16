import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  type ClientProjectItem, clientProjectStatusEnum, type ComponentItem, componentUpsertSchema, projectCreateSchema, type ProjectDetail,
} from '@ads/contracts';
import { AsyncCombobox } from '@/components/common/async-combobox';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { staffLookupQuery } from '@/features/clients/api';
import { allProjectsQuery, CLIENT_PROJECT_STATUSES, MEMBER_ROLE_LABELS, PLATFORM_LABELS, PROJECT_STATUSES, RUNTIME_LABELS, searchClients } from './api';

function PlatformChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-4">
      {Object.entries(PLATFORM_LABELS).map(([k, l]) => (
        <label key={k} className="flex items-center gap-2 text-sm">
          <Checkbox checked={value.includes(k)} onCheckedChange={(c) => onChange(c ? [...value, k] : value.filter((x) => x !== k))} />{l}
        </label>
      ))}
    </div>
  );
}

function StaffSelect({ value, onChange, placeholder = '— tayinlanmagan —' }: { value: string | null | undefined; onChange: (v: string) => void; placeholder?: string }) {
  const staff = useQuery(staffLookupQuery);
  return (
    <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {staff.data?.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ── Loyiha (yaratish / tahrirlash) ──
type PIn = z.input<typeof projectCreateSchema>;
type POut = z.output<typeof projectCreateSchema>;

export function ProjectFormSheet({ project, trigger }: { project?: ProjectDetail; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const def: PIn = {
    code: project?.code ?? '', name: project?.name ?? '', description: project?.description ?? '', status: (project?.status as PIn['status']) ?? 'PLANNING',
    ownerId: project?.owner?.id ?? '', repositoryUrl: project?.repositoryUrl ?? '', supportedPlatforms: (project?.supportedPlatforms as PIn['supportedPlatforms']) ?? [],
    isInternal: project?.isInternal ?? false,
  };
  const form = useForm<PIn, unknown, POut>({ resolver: zodResolver(projectCreateSchema), defaultValues: def });
  useEffect(() => { if (open) form.reset(def); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: async (v: POut) => {
      if (!project) return api.post<{ id: string }>('/projects', v);
      const { code: _c, ...rest } = v;
      await api.patch(`/projects/${project.id}`, { ...rest, rowVersion: project.rowVersion });
      return { id: project.id };
    },
    onSuccess: (r) => {
      toast.success('Saqlandi'); setOpen(false); void qc.invalidateQueries({ queryKey: ['projects'] });
      if (!project) void navigate({ to: '/projects/$projectId', params: { projectId: r.id } });
    },
    onError: (e) => handleApiError(e, form.setError),
  });
  const e = form.formState.errors;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{project ? 'Loyihani tahrirlash' : 'Yangi loyiha'}</SheetTitle>
          <SheetDescription>Loyiha — mijozlarga beriladigan mahsulot (AI, avtomatlashtirish, hisobot tizimi va h.k.)</SheetDescription>
        </SheetHeader>
        <form id="project-form" className="grid gap-4 px-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <Field label="Nomi" required error={e.name}><Input {...form.register('name')} placeholder="Savdo hisobotlari" /></Field>
          <Field label="Kod (slug)" required error={e.code} hint={project ? "Kod o'zgarmaydi" : 'Masalan: pos-retail. Keyin o\'zgartirib bo\'lmaydi'}>
            <Input {...form.register('code')} disabled={!!project} className="font-mono" />
          </Field>
          <Field label="Tavsif" error={e.description}><Textarea rows={3} {...form.register('description')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Holat">
              <Controller control={form.control} name="status" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="Mas'ul (PM)">
              <Controller control={form.control} name="ownerId" render={({ field }) => <StaffSelect value={field.value} onChange={field.onChange} />} />
            </Field>
          </div>
          <Field label="Repozitoriy URL" error={e.repositoryUrl}><Input {...form.register('repositoryUrl')} placeholder="https://git…" /></Field>
          <Field label="Platformalar">
            <Controller control={form.control} name="supportedPlatforms" render={({ field }) => <PlatformChecks value={field.value ?? []} onChange={field.onChange} />} />
          </Field>
          <label className="flex items-center justify-between gap-4 text-sm">Ichki loyiha (mijozlarga sotilmaydi)
            <Controller control={form.control} name="isInternal" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />} />
          </label>
        </form>
        <SheetFooter><Button type="submit" form="project-form" disabled={m.isPending}>{project ? 'Saqlash' : 'Yaratish'}</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Komponent ──
type CIn = z.input<typeof componentUpsertSchema>;
type COut = z.output<typeof componentUpsertSchema>;

export function ComponentDialog({ projectId, component, trigger }: { projectId: string; component?: ComponentItem; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const def: CIn = {
    key: component?.key ?? '', name: component?.name ?? '', description: component?.description ?? '', runtime: (component?.runtime as CIn['runtime']) ?? 'SERVER_SERVICE',
    supportedPlatforms: (component?.supportedPlatforms as CIn['supportedPlatforms']) ?? [], isActive: component?.isActive ?? true,
  };
  const form = useForm<CIn, unknown, COut>({ resolver: zodResolver(componentUpsertSchema), defaultValues: def });
  useEffect(() => { if (open) form.reset(def); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: (v: COut) => (component ? api.put(`/projects/${projectId}/components/${component.id}`, v) : api.post(`/projects/${projectId}/components`, v)),
    onSuccess: () => { toast.success('Saqlandi'); setOpen(false); void qc.invalidateQueries({ queryKey: ['projects', projectId] }); },
    onError: (err) => handleApiError(err, form.setError),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{component ? 'Komponentni tahrirlash' : 'Yangi komponent'}</DialogTitle>
          <DialogDescription>Loyiha qismi: masalan VPS'dagi server, mijozdagi lokal servis, GPU serverdagi AI model yoki ESP32 firmware.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nomi" required error={e.name}><Input {...form.register('name')} placeholder="Hisobot serveri" /></Field>
            <Field label="Kalit" required error={e.key}><Input className="font-mono" {...form.register('key')} placeholder="report-server" /></Field>
          </div>
          <Field label="Ishlash turi">
            <Controller control={form.control} name="runtime" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(RUNTIME_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </Field>
          <Field label="Platformalar">
            <Controller control={form.control} name="supportedPlatforms" render={({ field }) => <PlatformChecks value={field.value ?? []} onChange={field.onChange} />} />
          </Field>
          <Field label="Tavsif" error={e.description}><Textarea rows={2} {...form.register('description')} /></Field>
          <label className="flex items-center justify-between gap-4 text-sm">Faol
            <Controller control={form.control} name="isActive" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />} />
          </label>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Saqlash</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Jamoa a'zosi ──
export function MemberDialog({ projectId, trigger }: { projectId: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('DEVELOPER');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.put(`/projects/${projectId}/members/${userId}`, { role }),
    onSuccess: () => { toast.success("Qo'shildi"); setOpen(false); setUserId(''); void qc.invalidateQueries({ queryKey: ['projects', projectId] }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Jamoaga qo'shish</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Xodim"><StaffSelect value={userId} onChange={setUserId} placeholder="— tanlang —" /></Field>
          <Field label="Roli">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MEMBER_ROLE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter><Button disabled={!userId || m.isPending} onClick={() => m.mutate()}>Qo'shish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mijoz ↔ loyiha bog'lanishi ──
const linkSchema = z.object({
  clientId: z.string().min(1, 'Mijozni tanlang'),
  projectId: z.string().min(1, 'Loyihani tanlang'),
  status: clientProjectStatusEnum,
  startedOn: z.string().optional(),
  endedOn: z.string().optional(),
  accountManagerId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
type LinkForm = z.infer<typeof linkSchema>;

/** Yaratish: `clientId` yoki `projectId` dan biri qat'iy. Tahrirlash: `link` beriladi. */
export function ClientProjectDialog({ clientId, projectId, link, trigger }: {
  clientId?: string; projectId?: string; link?: ClientProjectItem; trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const projects = useQuery({ ...allProjectsQuery, enabled: open && !projectId && !link });
  const def: LinkForm = {
    clientId: link?.clientId ?? clientId ?? '', projectId: link?.projectId ?? projectId ?? '', status: (link?.status as LinkForm['status']) ?? 'ONBOARDING',
    startedOn: link?.startedOn ?? '', endedOn: link?.endedOn ?? '', accountManagerId: link?.accountManager?.id ?? '', notes: link?.notes ?? '',
  };
  const form = useForm<LinkForm>({ resolver: zodResolver(linkSchema), defaultValues: def });
  useEffect(() => { if (open) form.reset(def); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: (v: LinkForm) => {
      const body = { status: v.status, startedOn: v.startedOn || null, endedOn: v.endedOn || null, accountManagerId: v.accountManagerId || null, notes: v.notes || null };
      return link ? api.patch(`/client-projects/${link.id}`, { ...body, rowVersion: link.rowVersion }) : api.post('/client-projects', { ...body, clientId: v.clientId, projectId: v.projectId });
    },
    onSuccess: () => {
      toast.success(link ? 'Saqlandi' : 'Ulandi'); setOpen(false);
      void qc.invalidateQueries({ queryKey: ['client-projects'] }); void qc.invalidateQueries({ queryKey: ['projects'] }); void qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => handleApiError(e, form.setError),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{link ? `${link.clientName} — ${link.projectName}` : clientId ? 'Loyihaga ulash' : 'Mijoz qo\'shish'}</DialogTitle>
          <DialogDescription>Mijoz loyihadan foydalanadi: obunalar va qurilmadagi o'rnatmalar shu bog'lanishga yoziladi.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          {!link && !clientId && (
            <Field label="Mijoz" required error={e.clientId}>
              <Controller control={form.control} name="clientId" render={({ field }) => (
                <AsyncCombobox value={field.value} onChange={(it) => field.onChange(it?.id ?? '')} fetcher={searchClients} queryKey="clients" placeholder="Mijozni qidiring…" />
              )} />
            </Field>
          )}
          {!link && !projectId && (
            <Field label="Loyiha" required error={e.projectId}>
              <Controller control={form.control} name="projectId" render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>{projects.data?.filter((p) => !p.isInternal).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Holat">
              <Controller control={form.control} name="status" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLIENT_PROJECT_STATUSES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="Mas'ul menejer">
              <Controller control={form.control} name="accountManagerId" render={({ field }) => <StaffSelect value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Boshlangan sana" error={e.startedOn}><Input type="date" {...form.register('startedOn')} /></Field>
            <Field label="Tugagan sana" error={e.endedOn}><Input type="date" {...form.register('endedOn')} /></Field>
          </div>
          <Field label="Izoh" error={e.notes}><Textarea rows={2} {...form.register('notes')} /></Field>
          <DialogFooter><Button type="submit" disabled={m.isPending}>{link ? 'Saqlash' : 'Ulash'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
