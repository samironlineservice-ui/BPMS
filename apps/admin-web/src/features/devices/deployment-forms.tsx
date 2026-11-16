import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/common/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { allProjectsQuery, projectQuery } from '@/features/projects/api';
import { componentInstallationsQuery, DEVICE_KEYS, releaseQuery, releasesQuery } from './api';

/** Deployment rejasi: versiya → qaysi qurilmalardagi o'rnatmalar. Keyin rahbar tasdig'iga yuboriladi. */
export function DeploymentCreateSheet({ releaseId: fixedRelease, trigger }: { releaseId?: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(''); const [componentId, setComponentId] = useState(''); const [releaseId, setReleaseId] = useState(fixedRelease ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState(''); const [notes, setNotes] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fixed = useQuery({ ...releaseQuery(fixedRelease ?? ''), enabled: open && !!fixedRelease });
  const projects = useQuery({ ...allProjectsQuery, enabled: open && !fixedRelease });
  const project = useQuery({ ...projectQuery(projectId), enabled: open && !fixedRelease && !!projectId });
  const releases = useQuery({ ...releasesQuery({ componentId, pageSize: 50 }), enabled: open && !fixedRelease && !!componentId });
  const compId = fixedRelease ? fixed.data?.componentId : componentId;
  const insts = useQuery({ ...componentInstallationsQuery(compId ?? ''), enabled: open && !!compId });
  useEffect(() => { if (open) { setReleaseId(fixedRelease ?? ''); setPicked(new Set()); setWhen(''); setNotes(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const version = fixedRelease ? fixed.data?.version : releases.data?.items.find((r) => r.id === releaseId)?.version;
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof insts.data>>();
    for (const i of insts.data ?? []) m.set(i.clientName ?? 'Kompaniya (umumiy)', [...(m.get(i.clientName ?? 'Kompaniya (umumiy)') ?? []), i]);
    return [...m.entries()];
  }, [insts.data]);
  const toggle = (id: string, on: boolean) => { const n = new Set(picked); if (on) n.add(id); else n.delete(id); setPicked(n); };
  const m = useMutation({
    mutationFn: () => api.post<{ id: string; code: string }>('/deployments', {
      releaseId, installationIds: [...picked], scheduledAt: when ? new Date(when).toISOString() : null, notes: notes || null,
    }),
    onSuccess: (r) => { toast.success(`Reja tuzildi: ${r.code}. Endi tasdiqqa yuboring.`); setOpen(false); for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); void navigate({ to: '/deployments/$deploymentId', params: { deploymentId: r.id } }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Yangi deployment{version ? ` — ${version}` : ''}</SheetTitle>
          <SheetDescription>Qaysi qurilmalarga o'rnatilishini tanlang. Prod deployment rahbar tasdig'idan keyin boshlanadi.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          {!fixedRelease && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Loyiha">
                <Select value={projectId || undefined} onValueChange={(v) => { setProjectId(v); setComponentId(''); setReleaseId(''); setPicked(new Set()); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Komponent">
                <Select value={componentId || undefined} onValueChange={(v) => { setComponentId(v); setReleaseId(''); setPicked(new Set()); }} disabled={!projectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>{project.data?.components.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Versiya">
                <Select value={releaseId || undefined} onValueChange={setReleaseId} disabled={!componentId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>{releases.data?.items.filter((r) => r.status === 'READY' || r.status === 'PUBLISHED').map((r) => <SelectItem key={r.id} value={r.id}>{r.version} {r.channels.length ? `(${r.channels.join(', ')})` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          )}
          {compId && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Qurilmalar ({picked.size} / {insts.data?.length ?? 0})</span>
                {!!insts.data?.length && <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(picked.size === insts.data.length ? new Set() : new Set(insts.data.map((i) => i.id)))}>{picked.size === insts.data.length ? 'Hammasini olib tashlash' : 'Hammasini tanlash'}</Button>}
              </div>
              {groups.map(([client, list]) => (
                <div key={client} className="rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">{client}</div>
                  {list.map((i) => (
                    <label key={i.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                      <Checkbox checked={picked.has(i.id)} onCheckedChange={(c) => toggle(i.id, c === true)} />
                      <span className="flex-1"><span className="font-medium">{i.deviceName}</span> <span className="font-mono text-xs text-muted-foreground">{i.deviceCode}</span>{i.instanceName && <span className="text-xs text-muted-foreground"> · {i.instanceName}</span>}</span>
                      <Badge variant="outline" className="font-mono">{i.currentVersion ?? '—'}{version ? ` → ${version}` : ''}</Badge>
                    </label>
                  ))}
                </div>
              ))}
              {insts.data && !insts.data.length && <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">Bu komponent hech bir faol qurilmada qayd etilmagan. Qurilma kartochkasida komponent qo'shing.</p>}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reja vaqti (ixtiyoriy)" hint="Bo'sh — tasdiqlangach darhol"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          </div>
          <Field label="Izoh"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Texnik oyna, mas'ul, rollback rejasi…" /></Field>
        </div>
        <SheetFooter><Button disabled={!releaseId || !picked.size || m.isPending} onClick={() => m.mutate()}>Reja tuzish</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
