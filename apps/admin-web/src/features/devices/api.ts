import { queryOptions } from '@tanstack/react-query';
import type {
  DeploymentDetail, DeploymentListItem, DeviceDetail, DeviceListItem, InstallationDto, Paginated, ReleaseDetail, ReleaseListItem, TargetEventDto,
} from '@ads/contracts';
import type { ComboItem } from '@/components/common/async-combobox';
import { api } from '@/lib/api';

type Q = Record<string, string | number | boolean | undefined>;
export const devicesQuery = (q: Q) => queryOptions({ queryKey: ['devices', 'list', q], queryFn: () => api.get<Paginated<DeviceListItem>>('/devices', { pageSize: 20, ...q }) });
export const deviceQuery = (id: string) => queryOptions({ queryKey: ['devices', id], queryFn: () => api.get<DeviceDetail>(`/devices/${id}`) });
export const deviceTagsQuery = queryOptions({ queryKey: ['devices', 'tags'], queryFn: () => api.get<string[]>('/devices/tags'), staleTime: 60_000 });
export const releasesQuery = (q: Q) => queryOptions({ queryKey: ['releases', 'list', q], queryFn: () => api.get<Paginated<ReleaseListItem>>('/releases', { pageSize: 20, ...q }) });
export const releaseQuery = (id: string) => queryOptions({ queryKey: ['releases', id], queryFn: () => api.get<ReleaseDetail>(`/releases/${id}`) });
export const deploymentsQuery = (q: Q) => queryOptions({ queryKey: ['deployments', 'list', q], queryFn: () => api.get<Paginated<DeploymentListItem>>('/deployments', { pageSize: 20, ...q }) });
export const deploymentQuery = (id: string) => queryOptions({ queryKey: ['deployments', id], queryFn: () => api.get<DeploymentDetail>(`/deployments/${id}`), refetchInterval: 30_000 });
export const componentInstallationsQuery = (componentId: string) => queryOptions({
  queryKey: ['installations', componentId],
  queryFn: () => api.get<(InstallationDto & { deviceCode: string; deviceName: string; deviceStatus: string })[]>(`/components/${componentId}/installations`),
});
export const targetEventsQuery = (deploymentId: string, targetId: string) =>
  queryOptions({ queryKey: ['deployments', deploymentId, 'events', targetId], queryFn: () => api.get<TargetEventDto[]>(`/deployments/${deploymentId}/targets/${targetId}/events`) });

export const searchDevices = (q: string): Promise<ComboItem[]> =>
  api.get<Paginated<DeviceListItem>>('/devices', { q: q || undefined, pageSize: 20 }).then((r) => r.items.map((d) => ({ id: d.id, label: d.name, sub: `${d.code}${d.client ? ` · ${d.client.name}` : ''}` })));

export const DEVICE_KEYS = [['devices'], ['releases'], ['deployments'], ['installations'], ['approvals']];

export const CLASS_LABELS: Record<string, string> = {
  SERVER: 'Server', GPU_SERVER: 'GPU server', VPS: 'VPS', EDGE_SBC: 'Raspberry Pi / SBC', MICROCONTROLLER: 'ESP32 (mikrokontroller)', DESKTOP: 'Kompyuter', MOBILE: 'Mobil',
};
export const MODE_LABELS: Record<string, string> = { AGENT: 'Agent orqali', FIRMWARE_OTA: 'Firmware OTA', GATEWAY_PROXIED: 'Gateway orqali' };
export const ARCH_LABELS: Record<string, string> = { X64: 'x64', X86: 'x86', ARM64: 'arm64', ARMV7: 'armv7', XTENSA: 'Xtensa (ESP32/S3)', RISCV32: 'RISC-V (ESP32-C)' };
export const ARTIFACT_KIND_LABELS: Record<string, string> = {
  SERVICE_BUNDLE: 'Servis paketi', STATIC_WEB_BUNDLE: 'Statik web', MSI: 'MSI installer', EXE_INSTALLER: 'EXE installer', PORTABLE_ZIP: 'Portable ZIP',
  CONTAINER_COMPOSE: 'Docker Compose', MODEL_BUNDLE: 'AI model / data', FIRMWARE_IMAGE: 'Firmware (.bin)', APK: 'APK', AGENT_BINARY: 'ADS agent',
};
export const OWNER_LABELS: Record<string, string> = { CLIENT: 'Mijozniki', COMPANY: 'Kompaniyaniki' };
