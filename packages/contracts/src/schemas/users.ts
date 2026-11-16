import { z } from 'zod';

export const userStatus = z.enum(['INVITED', 'ACTIVE', 'LOCKED', 'DEACTIVATED']);

export const inviteUserSchema = z.object({
  email: z.email().trim().toLowerCase(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  roleKeys: z.array(z.string()).default([]),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  locale: z.enum(['uz', 'ru', 'en']).optional(),
  rowVersion: z.number().int(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const assignRoleSchema = z.object({
  roleId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

/** Rahbar foydalanuvchiga individual ruxsatlar beradi (ichkarida shaxsiy rol). */
export const setUserPermissionsSchema = z.object({
  permissions: z.array(z.string()).max(200),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type SetUserPermissionsInput = z.infer<typeof setUserPermissionsSchema>;

export const roleUpsertSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{2,40}$/, 'kichik lotin harflar, raqam va _'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string()).max(200),
});
export type RoleUpsertInput = z.infer<typeof roleUpsertSchema>;

export interface RoleRef { id: string; key: string; name: string; isSystem: boolean }
export interface UserListItem {
  id: string; email: string; fullName: string; status: string; lastLoginAt: string | null; mfaEnabled: boolean;
  roles: (RoleRef & { expiresAt: string | null })[];
}
export interface UserAssignment { id: string; role: RoleRef; expiresAt: string | null; grantedBy: string | null; createdAt: string; personal: boolean }
export interface UserDetail extends Omit<UserListItem, 'roles'> {
  phone: string | null; locale: string; rowVersion: number; createdAt: string;
  assignments: UserAssignment[];
  directPermissions: { permissions: string[]; expiresAt: string | null } | null;
  sessions: { id: string; ip: string | null; userAgent: string | null; lastSeenAt: string; createdAt: string; current: boolean }[];
}
export interface InviteResult { user: UserListItem; inviteUrl: string; expiresAt: string }
export interface PermissionItem { key: string; module: string; description: string; sensitive: boolean }
export interface RoleListItem extends RoleRef { description: string | null; permissionCount: number; userCount: number }
export interface RoleDetail extends RoleListItem { permissions: string[] }
export interface AuditItem {
  id: string; occurredAt: string; actorType: string; actorId: string | null; actorLabel: string | null; ip: string | null;
  action: string; resourceType: string; resourceId: string | null; result: string; reason: string | null;
  changes: unknown; metadata: unknown; requestId: string | null;
}
