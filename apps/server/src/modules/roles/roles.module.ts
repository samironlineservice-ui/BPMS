import { Body, Controller, Delete, Get, Injectable, Module, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { type PermissionItem, roleUpsertSchema, type RoleDetail, type RoleListItem, type RoleUpsertInput } from '@ads/contracts';
import { AuditService, diff } from '../../platform/audit.service.js';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { PermissionService } from '../../platform/auth/permission.service.js';
import { Db } from '../../platform/db.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../platform/errors.js';
import { ZodPipe } from '../../platform/zod.pipe.js';

@Injectable()
export class RolesService {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly perms: PermissionService) {}

  async permissions(): Promise<PermissionItem[]> {
    const rows = await this.db.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
    return rows.map((r) => ({ key: r.key, module: r.module, description: r.description, sensitive: r.sensitive }));
  }

  async list(): Promise<RoleListItem[]> {
    const roles = await this.db.role.findMany({
      where: { NOT: { key: { startsWith: 'u_' } } },
      include: { _count: { select: { permissions: true, assignments: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => ({
      id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem,
      permissionCount: r._count.permissions, userCount: r._count.assignments,
    }));
  }

  async get(id: string): Promise<RoleDetail> {
    const r = await this.db.role.findUnique({ where: { id }, include: { permissions: true, _count: { select: { assignments: true } } } });
    if (!r) throw notFound('Rol');
    return {
      id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem,
      permissionCount: r.permissions.length, userCount: r._count.assignments, permissions: r.permissions.map((p) => p.permissionKey).sort(),
    };
  }

  private assertSubset(auth: AuthContext, perms: string[]) {
    const missing = perms.filter((p) => !auth.permissions.has(p));
    if (missing.length) throw forbidden(`Sizda yo'q ruxsatlarni rolga qo'sha olmaysiz: ${missing.slice(0, 5).join(', ')}`);
  }

  async create(input: RoleUpsertInput, auth: AuthContext) {
    if (input.key.startsWith('u_')) throw badRequest("'u_' bilan boshlanuvchi kalit band");
    this.assertSubset(auth, input.permissions);
    if (await this.db.role.findUnique({ where: { key: input.key } })) throw conflict('Bunday kalitli rol mavjud');
    return this.db.$transaction(async (tx) => {
      const role = await tx.role.create({ data: { key: input.key, name: input.name, description: input.description ?? null } });
      if (input.permissions.length) await tx.rolePermission.createMany({ data: input.permissions.map((p) => ({ roleId: role.id, permissionKey: p })) });
      await this.audit.record(tx, { action: 'role.created', resourceType: 'role', resourceId: role.id, changes: { before: null, after: input } });
      return { id: role.id };
    });
  }

  async update(id: string, input: RoleUpsertInput, auth: AuthContext) {
    const role = await this.db.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw notFound('Rol');
    if (role.isSystem) throw forbidden("Tizim rolini o'zgartirib bo'lmaydi — yangi rol yarating");
    this.assertSubset(auth, input.permissions);
    const before = { name: role.name, description: role.description, permissions: role.permissions.map((p) => p.permissionKey).sort() };
    await this.db.$transaction(async (tx) => {
      await tx.role.update({ where: { id }, data: { name: input.name, description: input.description ?? null, rowVersion: { increment: 1 } } });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (input.permissions.length) await tx.rolePermission.createMany({ data: input.permissions.map((p) => ({ roleId: id, permissionKey: p })) });
      await this.audit.record(tx, { action: 'role.updated', resourceType: 'role', resourceId: id, changes: diff(before, { name: input.name, description: input.description ?? null, permissions: [...input.permissions].sort() }) });
    });
    this.perms.invalidate();
    return { ok: true };
  }

  async remove(id: string) {
    const role = await this.db.role.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } });
    if (!role) throw notFound('Rol');
    if (role.isSystem) throw forbidden("Tizim rolini o'chirib bo'lmaydi");
    if (role._count.assignments) throw conflict('Rol foydalanuvchilarga biriktirilgan');
    await this.db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id } });
      await this.audit.record(tx, { action: 'role.deleted', resourceType: 'role', resourceId: id, metadata: { key: role.key } });
    });
    return { ok: true };
  }
}

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermissions('users:read')
  permissions(): Promise<PermissionItem[]> {
    return this.roles.permissions();
  }

  @Get('roles')
  @RequirePermissions('users:read')
  list() {
    return this.roles.list();
  }

  @Get('roles/:id')
  @RequirePermissions('users:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.get(id);
  }

  @Post('roles')
  @RequirePermissions('users:manage_roles')
  create(@Body(new ZodPipe(roleUpsertSchema)) body: RoleUpsertInput, @Auth() a: AuthContext) {
    return this.roles.create(body, a);
  }

  @Put('roles/:id')
  @RequirePermissions('users:manage_roles')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(roleUpsertSchema)) body: RoleUpsertInput, @Auth() a: AuthContext) {
    return this.roles.update(id, body, a);
  }

  @Delete('roles/:id')
  @RequirePermissions('users:manage_roles')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(id);
  }
}

@Module({ controllers: [RolesController], providers: [RolesService] })
export class RolesModule {}
