import { z } from 'zod';

export const platformEnum = z.enum(['WINDOWS', 'LINUX', 'ANDROID', 'ESP_IDF']);
export const projectStatusEnum = z.enum(['PLANNING', 'IN_DEVELOPMENT', 'ACTIVE', 'MAINTENANCE', 'DEPRECATED', 'ARCHIVED']);
export const componentRuntimeEnum = z.enum(['SERVER_SERVICE', 'CONTAINER_STACK', 'STATIC_WEB', 'DESKTOP_APP', 'FIRMWARE', 'AI_MODEL', 'MOBILE_APP']);
export const projectMemberRoleEnum = z.enum(['LEAD', 'DEVELOPER', 'QA', 'SUPPORT']);
export const clientProjectStatusEnum = z.enum(['PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CHURNED']);

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'kichik lotin harflar, raqam va "-" (2–40)');
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optUuid = z.uuid().optional().nullable().or(z.literal('').transform(() => null));
const optDate = z.iso.date().optional().nullable().or(z.literal('').transform(() => null));

const projectFields = {
  name: z.string().trim().min(2).max(120),
  description: optText(2000),
  status: projectStatusEnum,
  ownerId: optUuid,
  repositoryUrl: z.url().optional().nullable().or(z.literal('').transform(() => null)),
  supportedPlatforms: z.array(platformEnum).max(4),
  isInternal: z.boolean(),
};
export const projectCreateSchema = z.object({
  ...projectFields,
  code: slug,
  status: projectFields.status.default('PLANNING'),
  supportedPlatforms: projectFields.supportedPlatforms.default([]),
  isInternal: projectFields.isInternal.default(false),
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export const projectUpdateSchema = z.object(projectFields).partial().extend({ rowVersion: z.number().int() });
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const componentUpsertSchema = z.object({
  key: slug,
  name: z.string().trim().min(2).max(120),
  description: optText(1000),
  runtime: componentRuntimeEnum,
  supportedPlatforms: z.array(platformEnum).max(4).default([]),
  isActive: z.boolean().default(true),
});
export type ComponentUpsertInput = z.infer<typeof componentUpsertSchema>;

export const memberUpsertSchema = z.object({ role: projectMemberRoleEnum });

const clientProjectFields = {
  status: clientProjectStatusEnum,
  startedOn: optDate,
  endedOn: optDate,
  accountManagerId: optUuid,
  notes: optText(2000),
};
export const clientProjectCreateSchema = z.object({
  ...clientProjectFields,
  clientId: z.uuid(),
  projectId: z.uuid(),
  status: clientProjectFields.status.default('ONBOARDING'),
});
export type ClientProjectCreateInput = z.infer<typeof clientProjectCreateSchema>;
export const clientProjectUpdateSchema = z.object(clientProjectFields).partial().extend({ rowVersion: z.number().int() });
export type ClientProjectUpdateInput = z.infer<typeof clientProjectUpdateSchema>;

export interface ProjectListItem {
  id: string; code: string; name: string; status: string; isInternal: boolean; supportedPlatforms: string[];
  owner: { id: string; fullName: string } | null; clientCount: number; componentCount: number; memberCount: number; createdAt: string;
}
export interface ComponentItem {
  id: string; key: string; name: string; description: string | null; runtime: string; supportedPlatforms: string[]; isActive: boolean; releaseCount: number;
}
export interface MemberItem { userId: string; fullName: string; email: string; role: string; addedAt: string }
export interface ClientProjectItem {
  id: string; clientId: string; projectId: string; clientCode: string; clientName: string; projectCode: string; projectName: string;
  status: string; startedOn: string | null; endedOn: string | null; accountManager: { id: string; fullName: string } | null;
  notes: string | null; rowVersion: number; subscriptionCount: number;
}
export interface ProjectDetail extends ProjectListItem {
  description: string | null; repositoryUrl: string | null; rowVersion: number; updatedAt: string;
  components: ComponentItem[]; members: MemberItem[]; clients: ClientProjectItem[];
}
