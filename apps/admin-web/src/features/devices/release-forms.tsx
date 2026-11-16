import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { FileItem, ReleaseDetail } from '@ads/contracts';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, uploadWithProgress } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { bytes } from '@/lib/format';
import { allProjectsQuery, PLATFORM_LABELS, projectQuery } from '@/features/projects/api';
import { ARCH_LABELS, ARTIFACT_KIND_LABELS, DEVICE_KEYS } from './api';

export function ReleaseCreateDialog({ projectId: fixedProject, trigger }: { projectId?: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(fixedProject ?? '');
  const [componentId, setComponentId] = useState('');
  const [version, setVersion] = useState(''); const [code, setCode] = useState('');
  const [security, setSecurity] = useState(false); const [critical, setCritical] = useState(false); const [notes, setNotes] = useState('');
  const projects = useQuery({ ...allProjectsQuery, enabled: open && !fixedProject });
  const project = useQuery({ ...projectQuery(projectId), enabled: open && !!projectId });
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => { if (open) { setProjectId(fixedProject ?? ''); setComponentId(''); setVersion(''); setCode(''); setSecurity(false); setCritical(false); setNotes(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version.trim());
  const m = useMutation({
    mutationFn: () => api.post<{ id: string }>('/releases', {
      componentId, version: version.trim(), versionCode: code ? Number(code) : undefined, securityFix: security, urgency: critical ? 'CRITICAL' : 'NORMAL', notes,
    }),
    onSuccess: (r) => { toast.success('Versiya yaratildi'); setOpen(false); for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); void navigate({ to: '/releases/$releaseId', params: { releaseId: r.id } }); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Yangi versiya</DialogTitle><DialogDescription>Avval qoralama: fayllar qo'shiladi, keyin "Tayyor" qilinadi (o'zgarmas bo'ladi) va kanalga chiqariladi.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          {!fixedProject && (
            <Field label="Loyiha">
              <Select value={projectId || undefined} onValueChange={(v) => { setProjectId(v); setComponentId(''); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Komponent">
            <Select value={componentId || undefined} onValueChange={setComponentId} disabled={!projectId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
              <SelectContent>{project.data?.components.filter((c) => c.isActive).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Versiya (SemVer)" required error={version && !semver ? 'Masalan: 2.4.1 yoki 2.5.0-beta.1' : undefined}><Input value={version} onChange={(e) => setVersion(e.target.value)} className="font-mono" placeholder="1.2.0" /></Field>
            <Field label="versionCode (ixtiyoriy)" hint="Bo'sh — avtomatik"><Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={security} onCheckedChange={(c) => setSecurity(c === true)} />Xavfsizlik tuzatishi</label>
            <label className="flex items-center gap-2"><Checkbox checked={critical} onCheckedChange={(c) => setCritical(c === true)} />Shoshilinch</label>
          </div>
          <Field label="O'zgarishlar (release notes)"><Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={'- Yangi hisobot qo\'shildi\n- Xatolar tuzatildi'} /></Field>
        </div>
        <DialogFooter><Button disabled={!componentId || !semver || m.isPending} onClick={() => m.mutate()}>Yaratish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Artefakt: faylni yuklash (SHA-256 serverda hisoblanadi) + platforma/arxitektura/tur. */
export function ArtifactDialog({ release, trigger }: { release: ReleaseDetail; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [platform, setPlatform] = useState('LINUX'); const [arch, setArch] = useState('X64'); const [kind, setKind] = useState('SERVICE_BUNDLE'); const [variant, setVariant] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('file', file!, file!.name);
      const up = await uploadWithProgress<FileItem>('/files', fd, setProgress);
      return api.post(`/releases/${release.id}/artifacts`, { fileId: up.id, platform, arch, kind, variant });
    },
    onSuccess: () => { toast.success("Fayl qo'shildi"); setOpen(false); setFile(null); setProgress(0); for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => { setProgress(0); handleApiError(e); },
  });
  const esp = platform === 'ESP_IDF';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!m.isPending) setOpen(o); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Fayl qo'shish — {release.version}</DialogTitle><DialogDescription>Har platforma/arxitektura uchun alohida build. Hash'lar avtomatik hisoblanadi.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <input ref={input} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" onClick={() => input.current?.click()}><Upload className="mr-2 size-4" />{file ? `${file.name} (${bytes(file.size)})` : 'Faylni tanlang'}</Button>
          {m.isPending && <Progress value={progress} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platforma">
              <Select value={platform} onValueChange={(v) => { setPlatform(v); if (v === 'ESP_IDF') { setArch('XTENSA'); setKind('FIRMWARE_IMAGE'); } else if (arch === 'XTENSA' || arch === 'RISCV32') setArch('X64'); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PLATFORM_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Arxitektura">
              <Select value={arch} onValueChange={setArch}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ARCH_LABELS).filter(([k]) => esp === (k === 'XTENSA' || k === 'RISCV32')).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Turi">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ARTIFACT_KIND_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Variant (ixtiyoriy)" hint="esp32s3, cuda12, cpu…"><Input value={variant} onChange={(e) => setVariant(e.target.value.toLowerCase())} className="font-mono" /></Field>
          </div>
        </div>
        <DialogFooter><Button disabled={!file || m.isPending} onClick={() => m.mutate()}>Yuklash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
