import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Cpu, HardDrive, Microchip, Monitor, Server, Smartphone } from 'lucide-react';
import { useState } from 'react';
import type { DeviceListItem, ReleaseListItem } from '@ads/contracts';
import { type Column, DataTable } from '@/components/common/data-table';
import { SearchInput } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { date } from '@/lib/format';
import { PLATFORM_LABELS } from '@/features/projects/api';
import { CLASS_LABELS, devicesQuery, releasesQuery } from './api';

export const ClassIcon = ({ cls }: { cls: string }) => {
  const c = 'size-4 shrink-0 text-muted-foreground';
  if (cls === 'MICROCONTROLLER') return <Microchip className={c} />;
  if (cls === 'GPU_SERVER') return <Cpu className={c} />;
  if (cls === 'DESKTOP') return <Monitor className={c} />;
  if (cls === 'MOBILE') return <Smartphone className={c} />;
  if (cls === 'EDGE_SBC') return <HardDrive className={c} />;
  return <Server className={c} />;
};

type F = { page: number; q?: string; status?: string; deviceClass?: string };
type Ext<T> = { value: T; set: (p: Partial<T>) => void };
function useF<T extends { page: number }>(ext?: Ext<T>) {
  const [v, setV] = useState<T>({ page: 1 } as T);
  return ext ?? { value: v, set: (p: Partial<T>) => setV((prev) => ({ ...prev, ...p })) };
}

export function DevicesTable({ clientId, filters }: { clientId?: string; filters?: Ext<F> }) {
  const { value: f, set } = useF<F>(filters);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(devicesQuery({ ...f, clientId }));
  const cols: Column<DeviceListItem>[] = [
    { key: 'name', header: 'Qurilma', cell: (r) => <div className="flex items-center gap-2"><ClassIcon cls={r.deviceClass} /><div><div className="font-medium">{r.name}</div><div className="font-mono text-xs text-muted-foreground">{r.code}{r.hostname ? ` · ${r.hostname}` : ''}</div></div></div> },
    ...(clientId ? [] : [{ key: 'owner', header: 'Egasi', cell: (r: DeviceListItem) => (r.client ? <span>{r.client.name}{r.site ? <span className="text-xs text-muted-foreground"> · {r.site.name}</span> : null}</span> : <Badge variant="outline">Kompaniya</Badge>) }]),
    { key: 'type', header: 'Turi', cell: (r) => <span className="text-sm">{CLASS_LABELS[r.deviceClass]} · {PLATFORM_LABELS[r.platform] ?? r.platform}</span> },
    { key: 'status', header: 'Holat', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'inst', header: 'Komponentlar', className: 'text-right', cell: (r) => r.installationCount },
    { key: 'tags', header: 'Teglar', cell: (r) => <div className="flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div> },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Nom, kod, hostname, mijoz…" />
        <Select value={f.deviceClass ?? 'all'} onValueChange={(v) => set({ deviceClass: v === 'all' ? undefined : v, page: 1 })}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Barcha turlar</SelectItem>{Object.entries(CLASS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.status ?? 'all'} onValueChange={(v) => set({ status: v === 'all' ? undefined : v, page: 1 })}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Faol va o'chirilgan</SelectItem><SelectItem value="ACTIVE">Faol</SelectItem><SelectItem value="DISABLED">O'chirilgan</SelectItem><SelectItem value="DECOMMISSIONED">Foydalanishdan chiqqan</SelectItem></SelectContent>
        </Select>
      </div>
      <DataTable columns={cols} loading={isLoading} rows={data?.items} rowKey={(r) => r.id} empty="Qurilmalar yo'q"
        onRowClick={(r) => navigate({ to: '/devices/$deviceId', params: { deviceId: r.id } })}
        page={f.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })} />
    </>
  );
}

type RF = { page: number; q?: string; status?: string };
export function ReleasesTable({ projectId, filters }: { projectId?: string; filters?: Ext<RF> }) {
  const { value: f, set } = useF<RF>(filters);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(releasesQuery({ ...f, projectId }));
  const cols: Column<ReleaseListItem>[] = [
    { key: 'v', header: 'Versiya', cell: (r) => <div><span className="font-mono font-medium">{r.version}</span>{r.securityFix && <Badge variant="destructive" className="ml-2">xavfsizlik</Badge>}{r.urgency === 'CRITICAL' && <Badge variant="outline" className="ml-1">shoshilinch</Badge>}</div> },
    { key: 'c', header: 'Komponent', cell: (r) => <div><div>{r.componentName}</div>{!projectId && <div className="text-xs text-muted-foreground">{r.projectName}</div>}</div> },
    { key: 's', header: 'Holat', cell: (r) => <div className="flex flex-wrap items-center gap-1"><StatusBadge status={r.status} />{r.channels.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}</div> },
    { key: 'a', header: 'Fayllar', className: 'text-right', cell: (r) => r.artifactCount },
    { key: 'i', header: "O'rnatilgan", className: 'text-right', cell: (r) => r.installedCount },
    { key: 'd', header: 'Sana', cell: (r) => <span className="text-sm text-muted-foreground">{date(r.publishedAt ?? r.createdAt)}</span> },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Versiya, komponent, loyiha…" />
        <Select value={f.status ?? 'all'} onValueChange={(v) => set({ status: v === 'all' ? undefined : v, page: 1 })}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem><SelectItem value="DRAFT">Qoralama</SelectItem><SelectItem value="READY">Tayyor</SelectItem>
            <SelectItem value="PUBLISHED">Chiqarilgan</SelectItem><SelectItem value="DEPRECATED">Eskirgan</SelectItem><SelectItem value="REVOKED">Bekor qilingan</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={cols} loading={isLoading} rows={data?.items} rowKey={(r) => r.id} empty="Versiyalar yo'q"
        onRowClick={(r) => navigate({ to: '/releases/$releaseId', params: { releaseId: r.id } })}
        page={f.page} pageSize={data?.pageSize} total={data?.total} onPageChange={(page) => set({ page })} />
    </>
  );
}
