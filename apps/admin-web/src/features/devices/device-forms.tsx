import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { DeviceDetail, InstallationDto } from '@ads/contracts';
import { AsyncCombobox } from '@/components/common/async-combobox';
import { Field } from '@/components/common/field';
import { TagInput } from '@/components/common/tag-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';
import { clientQuery } from '@/features/clients/api';
import { allProjectsQuery, clientProjectsQuery, PLATFORM_LABELS, projectQuery, searchClients } from '@/features/projects/api';
import { ARCH_LABELS, CLASS_LABELS, DEVICE_KEYS, deviceTagsQuery, MODE_LABELS, releasesQuery, searchDevices } from './api';

/** Qurilma turi → mos platforma/arxitektura/boshqaruv (DB qoidalari bilan bir xil). */
const isMcu = (cls: string) => cls === 'MICROCONTROLLER';

function Sel({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: Record<string, string>; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(options).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function DeviceFormSheet({ device, clientId: fixedClient, trigger }: { device?: DeviceDetail; clientId?: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState('CLIENT');
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [name, setName] = useState(''); const [hostname, setHostname] = useState('');
  const [cls, setCls] = useState('SERVER'); const [platform, setPlatform] = useState('LINUX'); const [arch, setArch] = useState('X64');
  const [mode, setMode] = useState('AGENT'); const [gateway, setGateway] = useState('');
  const [osName, setOsName] = useState(''); const [osVersion, setOsVersion] = useState(''); const [notes, setNotes] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true); const [tags, setTags] = useState<string[]>([]);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tagList = useQuery({ ...deviceTagsQuery, enabled: open });
  const client = useQuery({ ...clientQuery(clientId), enabled: open && !!clientId });
  useEffect(() => {
    if (!open) return;
    setOwner(device?.ownerType ?? 'CLIENT'); setClientId(device?.client?.id ?? fixedClient ?? ''); setSiteId(device?.site?.id ?? '');
    setName(device?.name ?? ''); setHostname(device?.hostname ?? ''); setCls(device?.deviceClass ?? 'SERVER'); setPlatform(device?.platform ?? 'LINUX');
    setArch(device?.arch ?? 'X64'); setMode(device?.managementMode ?? 'AGENT'); setGateway(device?.gateway?.id ?? ''); setOsName(device?.osName ?? '');
    setOsVersion(device?.osVersion ?? ''); setNotes(device?.notes ?? ''); setAutoUpdate(device?.autoUpdate ?? true); setTags(device?.tags ?? []);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // ESP32 ↔ ESP-IDF ↔ agentsiz boshqaruv
  const onClass = (v: string) => {
    setCls(v);
    if (isMcu(v)) { setPlatform('ESP_IDF'); setArch('XTENSA'); setMode('FIRMWARE_OTA'); }
    else { if (platform === 'ESP_IDF') { setPlatform('LINUX'); setArch('X64'); } setMode('AGENT'); setGateway(''); }
  };
  const m = useMutation({
    mutationFn: async () => {
      const common = {
        name, deviceClass: cls, platform, arch, managementMode: mode, gatewayDeviceId: mode === 'GATEWAY_PROXIED' ? gateway : null, hostname, osName, osVersion,
        notes, autoUpdate, tags, siteId: owner === 'CLIENT' ? (siteId || null) : null,
      };
      if (device) { await api.patch(`/devices/${device.id}`, { ...common, rowVersion: device.rowVersion }); return { id: device.id, code: device.code }; }
      return api.post<{ id: string; code: string }>('/devices', { ...common, ownerType: owner, clientId: owner === 'CLIENT' ? clientId : null });
    },
    onSuccess: (r) => {
      toast.success(device ? 'Saqlandi' : `Qurilma ro'yxatga olindi: ${r.code}`); setOpen(false);
      for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k });
      if (!device) void navigate({ to: '/devices/$deviceId', params: { deviceId: r.id } });
    },
    onError: (e) => handleApiError(e),
  });
  const mcu = isMcu(cls);
  const platforms = mcu ? { ESP_IDF: 'ESP-IDF (ESP32)' } : Object.fromEntries(Object.entries(PLATFORM_LABELS).filter(([k]) => k !== 'ESP_IDF'));
  const arches: Record<string, string> = mcu ? { XTENSA: ARCH_LABELS.XTENSA!, RISCV32: ARCH_LABELS.RISCV32! } : { X64: 'x64', ARM64: 'arm64', ARMV7: 'armv7', X86: 'x86' };
  const modes: Record<string, string> = mcu ? { FIRMWARE_OTA: MODE_LABELS.FIRMWARE_OTA!, GATEWAY_PROXIED: MODE_LABELS.GATEWAY_PROXIED! } : { AGENT: MODE_LABELS.AGENT! };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{device ? 'Qurilmani tahrirlash' : "Qurilmani ro'yxatga olish"}</SheetTitle>
          <SheetDescription>Mijozdagi server, Raspberry Pi, GPU server, VPS yoki ESP32. Agent ulanishi keyingi bosqichda — hozircha qo'lda yuritiladi.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          <Field label="Nomi" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chilonzor filial serveri" /></Field>
          {!device && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Egasi"><Sel value={owner} onChange={setOwner} options={{ CLIENT: 'Mijozniki', COMPANY: 'Kompaniyaniki (VPS, GPU)' }} disabled={!!fixedClient} /></Field>
              {owner === 'CLIENT' && !fixedClient && (
                <Field label="Mijoz" required><AsyncCombobox value={clientId} onChange={(it) => { setClientId(it?.id ?? ''); setSiteId(''); }} fetcher={searchClients} queryKey="clients" placeholder="Mijoz…" /></Field>
              )}
            </div>
          )}
          {owner === 'CLIENT' && client.data && client.data.sites.length > 0 && (
            <Field label="Filial">
              <Select value={siteId || 'none'} onValueChange={(v) => setSiteId(v === 'none' ? '' : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">— ko'rsatilmagan —</SelectItem>{client.data.sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Turi"><Sel value={cls} onChange={onClass} options={CLASS_LABELS} /></Field>
            <Field label="Boshqaruv"><Sel value={mode} onChange={setMode} options={modes} /></Field>
            <Field label="Platforma"><Sel value={platform} onChange={setPlatform} options={platforms} /></Field>
            <Field label="Arxitektura"><Sel value={arch} onChange={setArch} options={arches} /></Field>
          </div>
          {mode === 'GATEWAY_PROXIED' && (
            <Field label="Gateway-qurilma" hint="ESP32 shu agent-qurilma orqali yangilanadi">
              <AsyncCombobox value={gateway} onChange={(it) => setGateway(it?.id ?? '')} fetcher={searchDevices} queryKey="devices" placeholder="Agent-qurilma…" />
            </Field>
          )}
          {!mcu && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Hostname"><Input value={hostname} onChange={(e) => setHostname(e.target.value)} className="font-mono" /></Field>
              <Field label="OS"><Input value={osName} onChange={(e) => setOsName(e.target.value)} placeholder="Ubuntu" /></Field>
              <Field label="OS versiyasi"><Input value={osVersion} onChange={(e) => setOsVersion(e.target.value)} placeholder="24.04" /></Field>
            </div>
          )}
          <Field label="Teglar"><TagInput value={tags} onChange={setTags} suggestions={tagList.data} /></Field>
          <Field label="Texnik izoh" hint="CPU/RAM/GPU, joylashuv, kirish usuli (parol yozmang!)"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <label className="flex items-center justify-between text-sm">Avtomatik yangilanish (agent bosqichida)<Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} /></label>
        </div>
        <SheetFooter><Button disabled={name.trim().length < 2 || (owner === 'CLIENT' && !clientId) || (mode === 'GATEWAY_PROXIED' && !gateway) || m.isPending} onClick={() => m.mutate()}>Saqlash</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Qurilmaga loyiha komponentini qo'shish (nima o'rnatilgan, qaysi mijoz uchun, qaysi versiya). */
export function InstallationDialog({ device, installation, trigger }: { device: DeviceDetail; installation?: InstallationDto; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(''); const [componentId, setComponentId] = useState('');
  const [cpId, setCpId] = useState(''); const [instance, setInstance] = useState(''); const [releaseId, setReleaseId] = useState(''); const [version, setVersion] = useState('');
  const qc = useQueryClient();
  const projects = useQuery({ ...allProjectsQuery, enabled: open && !installation });
  const project = useQuery({ ...projectQuery(projectId), enabled: open && !!projectId });
  const links = useQuery({ ...clientProjectsQuery({ projectId }), enabled: open && !!projectId && device.ownerType === 'COMPANY' });
  const compId = installation?.componentId ?? componentId;
  const releases = useQuery({ ...releasesQuery({ componentId: compId, pageSize: 50 }), enabled: open && !!compId });
  useEffect(() => {
    if (!open) return;
    setProjectId(installation?.projectId ?? ''); setComponentId(installation?.componentId ?? ''); setCpId(installation?.clientProjectId ?? '');
    setInstance(installation?.instanceName ?? ''); setReleaseId(installation?.currentReleaseId ?? ''); setVersion(installation?.currentVersion ?? '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => {
      const body = { instanceName: instance, currentReleaseId: releaseId || null, currentVersion: releaseId ? null : (version || null) };
      return installation
        ? api.patch(`/devices/${device.id}/installations/${installation.id}`, body)
        : api.post(`/devices/${device.id}/installations`, { ...body, componentId, clientProjectId: cpId || null });
    },
    onSuccess: () => { toast.success('Saqlandi'); setOpen(false); for (const k of DEVICE_KEYS) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => handleApiError(e),
  });
  const comps = (project.data?.components ?? []).filter((c) => c.isActive && (device.platform === 'ESP_IDF') === (c.runtime === 'FIRMWARE'));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{installation ? `${installation.componentName} — versiya` : "Komponent qo'shish"}</DialogTitle>
          <DialogDescription>Qurilmada qaysi loyiha qismi ishlayotganini qayd qiling. Versiya deployment yakunlanganda avtomatik yangilanadi.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!installation && (
            <>
              <Field label="Loyiha">
                <Select value={projectId || undefined} onValueChange={(v) => { setProjectId(v); setComponentId(''); setCpId(''); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Komponent" hint={projectId && project.data && !comps.length ? 'Bu qurilma turiga mos komponent yo\'q (loyiha → Komponentlar)' : undefined}>
                <Select value={componentId || undefined} onValueChange={setComponentId} disabled={!projectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>{comps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} <span className="font-mono text-xs text-muted-foreground">{c.key}</span></SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {device.ownerType === 'COMPANY' && (
                <Field label="Qaysi mijoz uchun" hint="Bo'sh — bir nechta mijozga xizmat qiluvchi umumiy instans">
                  <Select value={cpId || 'shared'} onValueChange={(v) => setCpId(v === 'shared' ? '' : v)} disabled={!projectId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="shared">— umumiy instans —</SelectItem>{links.data?.map((l) => <SelectItem key={l.id} value={l.id}>{l.clientName}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}
          <Field label="Instans nomi (ixtiyoriy)"><Input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="prod, client-a…" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Joriy versiya (reyestrdan)">
              <Select value={releaseId || 'none'} onValueChange={(v) => setReleaseId(v === 'none' ? '' : v)} disabled={!compId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">— qo'lda kiritish —</SelectItem>{releases.data?.items.filter((r) => r.status !== 'DRAFT').map((r) => <SelectItem key={r.id} value={r.id}>{r.version}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {!releaseId && <Field label="Versiya (matn)"><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="0.9.0" className="font-mono" /></Field>}
          </div>
        </div>
        <DialogFooter><Button disabled={(!installation && !componentId) || m.isPending} onClick={() => m.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
