import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  assignRoleSchema, type AssignRoleInput, inviteUserSchema, type InviteUserInput, listQuerySchema,
  setUserPermissionsSchema, type SetUserPermissionsInput, updateUserSchema, type UpdateUserInput,
} from '@ads/contracts';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { UsersService } from './users.service.js';

const usersQuery = listQuerySchema.extend({ status: z.enum(['INVITED', 'ACTIVE', 'LOCKED', 'DEACTIVATED']).optional() });
const uuid = new ParseUUIDPipe({ version: undefined });

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  list(@Query(new ZodPipe(usersQuery)) q: z.infer<typeof usersQuery>) {
    return this.users.list(q);
  }

  @Get('lookup')
  lookup() {
    return this.users.lookup();
  }

  @Get(':id')
  @RequirePermissions('users:read')
  get(@Param('id', uuid) id: string, @Auth() a: AuthContext) {
    return this.users.get(id, a);
  }

  @Post()
  @RequirePermissions('users:invite')
  invite(@Body(new ZodPipe(inviteUserSchema)) body: InviteUserInput, @Auth() a: AuthContext) {
    return this.users.invite(body, a);
  }

  @Post(':id/reinvite')
  @RequirePermissions('users:invite')
  reinvite(@Param('id', uuid) id: string, @Auth() a: AuthContext) {
    return this.users.reinvite(id, a);
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  update(@Param('id', uuid) id: string, @Body(new ZodPipe(updateUserSchema)) body: UpdateUserInput) {
    return this.users.update(id, body);
  }

  @Post(':id/deactivate')
  @RequirePermissions('users:deactivate')
  deactivate(@Param('id', uuid) id: string, @Auth() a: AuthContext) {
    return this.users.setStatus(id, 'DEACTIVATED', a);
  }

  @Post(':id/activate')
  @RequirePermissions('users:deactivate')
  activate(@Param('id', uuid) id: string, @Auth() a: AuthContext) {
    return this.users.setStatus(id, 'ACTIVE', a);
  }

  @Post(':id/reset-mfa')
  @RequirePermissions('users:manage_roles')
  resetMfa(@Param('id', uuid) id: string, @Auth() a: AuthContext) {
    return this.users.resetMfa(id, a);
  }

  @Post(':id/roles')
  @RequirePermissions('users:manage_roles')
  assignRole(@Param('id', uuid) id: string, @Body(new ZodPipe(assignRoleSchema)) body: AssignRoleInput, @Auth() a: AuthContext) {
    return this.users.assignRole(id, body, a);
  }

  @Delete(':id/roles/:assignmentId')
  @RequirePermissions('users:manage_roles')
  revokeRole(@Param('id', uuid) id: string, @Param('assignmentId', uuid) aid: string, @Auth() a: AuthContext) {
    return this.users.revokeRole(id, aid, a);
  }

  @Put(':id/permissions')
  @RequirePermissions('users:manage_roles')
  setPermissions(@Param('id', uuid) id: string, @Body(new ZodPipe(setUserPermissionsSchema)) body: SetUserPermissionsInput, @Auth() a: AuthContext) {
    return this.users.setDirectPermissions(id, body, a);
  }

  @Delete(':id/sessions/:sessionId')
  @RequirePermissions('users:manage_roles')
  revokeSession(@Param('id', uuid) id: string, @Param('sessionId', uuid) sid: string) {
    return this.users.revokeSession(id, sid);
  }
}
