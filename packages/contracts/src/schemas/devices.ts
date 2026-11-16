import { z } from 'zod';
import { platformEnum } from './projects.js';

const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optUuid = z.uuid().optional().nullable().or(z.literal('').transform(() => null));
const reason = z.string().trim().min(3, 'Sababni yozing').max(500);

export const cpuArchEnum = z.enum(['X64', 'X86', 'ARM64', 'ARMV7', 'XTENSA', 'RISCV32']);
export const deviceClassEnum = z.enum(['SERVER', 'GPU_SERVER', 'VPS', 'EDGE_SBC', 'MICROCONTROLLER', 'DESKTOP', 'MOBILE']);
export const deviceOwnerEnum = z.enum(['CLIENT', 'COMPANY']);
export const managementModeEnum = z.enum(['AGENT', 'FIRMWARE_OTA', 'GATEWAY_PROXIED']);
export const deviceStatusEnum = z.enum(['PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REVOKED', 'DECOMMISSIONED']);
export const artifactKindEnum = z.enum([
  'SERVICE_BUNDLE', 'STATIC_WEB_BUNDLE', 'MSI', 'EXE_INSTALLER', 'PORTABLE_ZIP', 'CONTAINER_COMPOSE', 'MODEL_BUNDLE', 'FIRMWARE_IMAGE', 'APK', 'AGENT_BINARY',
]);
export const targetStatusEnum = z.enum([
  'PENDING', 'WAITING_WINDOW', 'BLOCKED_ENTITLEMENT', 'DOWNLOADING', 'DOWNLOADED', 'INSTALLING', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'SKIPPED', 'CANCELLED',
]);

// ── Qurilmalar ──
const deviceFields = {
  name: z.string().trim().min(2).max(120),
  ownerType: deviceOwnerEnum,
  clientId: optUuid,
  siteId: optUuid,
  deviceClass: deviceClassEnum,
  managementMode: managementModeEnum,
  gatewayDeviceId: optUuid,
  platform: platformEnum,
  arch: cpuArchEnum,
  hostname: optText(120),
  osName: optText(80),
  osVersion: optText(80),
  timezone: optText(60),
  notes: optText(1000),
  autoUpdate: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
};
export const deviceCreateSchema = z.object({
  ...deviceFields,
  ownerType: deviceFields.ownerType.default('CLIENT'),
  managementMode: deviceFields.managementMode.default('AGENT'),
  autoUpdate: deviceFields.autoUpdate.default(true),
  tags: deviceFields.tags.default([]),
});
export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;
export const deviceUpdateSchema = z.object(deviceFields).omit({ ownerType: true, clientId: true }).partial().extend({ rowVersion: z.number().int() });
export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;
export const deviceDecommissionSchema = z.object({ reason, rowVersion: z.number().int() });

export const installationCreateSchema = z.object({
  componentId: z.uuid(),
  clientProjectId: optUuid, // mijoz qurilmasida majburiy; kompaniya qurilmasida — bo'sh (umumiy instans) yoki mijoz instansi
  instanceName: optText(80),
  currentReleaseId: optUuid,
  currentVersion: optText(60),
  installPath: optText(300),
});
export type InstallationCreateInput = z.infer<typeof installationCreateSchema>;
export const installationUpdateSchema = z.object({
  instanceName: optText(80),
  currentReleaseId: optUuid,
  currentVersion: optText(60),
  pinnedReleaseId: optUuid,
  installPath: optText(300),
  status: z.enum(['INSTALLING', 'INSTALLED', 'UPDATING', 'FAILED', 'UNINSTALLED']).optional(),
  lastError: optText(1000),
});
export type InstallationUpdateInput = z.infer<typeof installationUpdateSchema>;

// ── Relizlar ──
export const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
export const releaseCreateSchema = z.object({
  componentId: z.uuid(),
  version: z.string().trim().regex(semverRegex, 'SemVer: 2.4.1 yoki 2.5.0-beta.1'),
  versionCode: z.number().int().min(1).optional(), // bo'sh — major×1 000 000 + minor×1 000 + patch
  securityFix: z.boolean().default(false),
  urgency: z.enum(['NORMAL', 'CRITICAL']).default('NORMAL'),
  minAgentVersion: optText(30),
  upgradeFrom: optText(80),
  notes: z.string().trim().max(20000).default(''),
});
export type ReleaseCreateInput = z.infer<typeof releaseCreateSchema>;
export const releaseNotesSchema = z.object({ notes: z.string().trim().max(20000) });
export const artifactCreateSchema = z.object({
  fileId: z.uuid(),
  platform: platformEnum,
  arch: cpuArchEnum,
  kind: artifactKindEnum,
  variant: z.string().trim().max(40).regex(/^[a-z0-9._-]*$/, 'kichik harf, raqam, . _ -').default(''),
});
export type ArtifactCreateInput = z.infer<typeof artifactCreateSchema>;
export const promoteSchema = z.object({ channelKey: z.string().trim().min(2).max(30) });
export const revokeSchema = z.object({ reason });

// ── Deploymentlar ──
export const deploymentCreateSchema = z.object({
  releaseId: z.uuid(),
  installationIds: z.array(z.uuid()).min(1).max(5000),
  strategy: z.enum(['ALL_AT_ONCE', 'PHASED']).default('ALL_AT_ONCE'),
  scheduledAt: z.iso.datetime({ offset: true }).optional().nullable(),
  respectMaintenance: z.boolean().default(true),
  notes: optText(2000),
});
export type DeploymentCreateInput = z.infer<typeof deploymentCreateSchema>;
export const targetUpdateSchema = z.object({
  status: z.enum(['INSTALLING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'SKIPPED']),
  message: optText(1000),
});
export type TargetUpdateInput = z.infer<typeof targetUpdateSchema>;

// ── DTO'lar ──
export interface DeviceListItem {
  id: string; code: string; name: string; ownerType: string; client: { id: string; code: string; name: string } | null; site: { id: string; name: string } | null;
  deviceClass: string; managementMode: string; platform: string; arch: string; status: string; isOnline: boolean; lastSeenAt: string | null;
  hostname: string | null; tags: string[]; installationCount: number; createdAt: string;
}
export interface InstallationDto {
  id: string; deviceId: string; componentId: string; componentKey: string; componentName: string; runtime: string; projectId: string; projectName: string;
  clientProjectId: string | null; clientName: string | null; instanceName: string | null; currentReleaseId: string | null; currentVersion: string | null;
  pinnedReleaseId: string | null; pinnedVersion: string | null; status: string; installPath: string | null; lastReportedAt: string | null; lastError: string | null; updatedAt: string;
}
export interface DeviceDetail extends DeviceListItem {
  gateway: { id: string; code: string; name: string } | null; osName: string | null; osVersion: string | null; agentVersion: string | null;
  timezone: string | null; autoUpdate: boolean; notes: string | null; revokedAt: string | null; revokeReason: string | null; rowVersion: number; updatedAt: string;
  installations: InstallationDto[];
  recentTargets: { id: string; deploymentId: string; deploymentCode: string; componentName: string; toVersion: string; status: string; updatedAt: string }[];
}
export interface ArtifactDto {
  id: string; platform: string; arch: string; kind: string; variant: string; fileId: string; fileName: string; sha256: string; sizeBytes: string; tufTargetPath: string; createdAt: string;
}
export interface ReleaseListItem {
  id: string; projectId: string; projectName: string; componentId: string; componentKey: string; componentName: string; version: string; versionCode: number;
  status: string; securityFix: boolean; urgency: string; channels: string[]; artifactCount: number; installedCount: number; createdBy: string; createdAt: string; publishedAt: string | null;
}
export interface ReleaseDetail extends ReleaseListItem {
  notes: string; minAgentVersion: string | null; upgradeFrom: string | null; publishedBy: string | null; revokedAt: string | null; revokeReason: string | null;
  rowVersion: number; artifacts: ArtifactDto[]; availableChannels: { key: string; name: string; isDefault: boolean }[];
  deployments: { id: string; code: string; status: string; targets: number; createdAt: string }[];
}
export interface DeploymentListItem {
  id: string; code: string; projectName: string; componentName: string; version: string; status: string; strategy: string;
  total: number; succeeded: number; failed: number; pending: number; createdBy: string; createdAt: string; scheduledAt: string | null; startedAt: string | null; completedAt: string | null;
}
export interface DeploymentTargetDto {
  id: string; deviceId: string; deviceCode: string; deviceName: string; clientName: string | null; installationId: string | null; instanceName: string | null;
  fromVersion: string | null; status: string; attempt: number; lastError: string | null; startedAt: string | null; finishedAt: string | null; updatedAt: string;
}
export interface DeploymentDetail extends DeploymentListItem {
  projectId: string; componentId: string; releaseId: string; respectMaintenance: boolean; notes: string | null; approvalRequestId: string | null; rowVersion: number;
  targets: DeploymentTargetDto[]; approvals: { id: string; policyKey: string; status: string; createdAt: string }[];
}
export interface TargetEventDto { id: string; receivedAt: string; status: string; message: string | null; by: string | null }
