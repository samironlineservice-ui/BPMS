import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  clientProjectCreateSchema, type ClientProjectCreateInput, clientProjectUpdateSchema, type ClientProjectUpdateInput,
  componentUpsertSchema, type ComponentUpsertInput, listQuerySchema, memberUpsertSchema, projectCreateSchema, type ProjectCreateInput,
  projectStatusEnum, projectUpdateSchema, type ProjectUpdateInput,
} from '@ads/contracts';
import { RequirePermissions } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { ProjectsService } from './projects.service.js';

const projectsQuery = listQuerySchema.extend({ status: projectStatusEnum.optional() });
const linksQuery = z.object({ clientId: z.uuid().optional(), projectId: z.uuid().optional() });
const id = new ParseUUIDPipe();

@Controller('projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get() @RequirePermissions('projects:read')
  list(@Query(new ZodPipe(projectsQuery)) q: z.infer<typeof projectsQuery>) { return this.svc.list(q); }

  @Get(':id') @RequirePermissions('projects:read')
  get(@Param('id', id) pid: string) { return this.svc.get(pid); }

  @Post() @RequirePermissions('projects:create')
  create(@Body(new ZodPipe(projectCreateSchema)) b: ProjectCreateInput) { return this.svc.create(b); }

  @Patch(':id') @RequirePermissions('projects:update')
  update(@Param('id', id) pid: string, @Body(new ZodPipe(projectUpdateSchema)) b: ProjectUpdateInput) { return this.svc.update(pid, b); }

  @Post(':id/archive') @RequirePermissions('projects:archive')
  archive(@Param('id', id) pid: string) { return this.svc.archive(pid); }

  @Post(':id/components') @RequirePermissions('projects:update')
  addComponent(@Param('id', id) pid: string, @Body(new ZodPipe(componentUpsertSchema)) b: ComponentUpsertInput) { return this.svc.addComponent(pid, b); }

  @Put(':id/components/:componentId') @RequirePermissions('projects:update')
  updateComponent(@Param('id', id) pid: string, @Param('componentId', id) cid: string, @Body(new ZodPipe(componentUpsertSchema)) b: ComponentUpsertInput) {
    return this.svc.updateComponent(pid, cid, b);
  }

  @Delete(':id/components/:componentId') @RequirePermissions('projects:update')
  removeComponent(@Param('id', id) pid: string, @Param('componentId', id) cid: string) { return this.svc.removeComponent(pid, cid); }

  @Put(':id/members/:userId') @RequirePermissions('projects:manage_members')
  setMember(@Param('id', id) pid: string, @Param('userId', id) uid: string, @Body(new ZodPipe(memberUpsertSchema)) b: z.infer<typeof memberUpsertSchema>) {
    return this.svc.setMember(pid, uid, b.role);
  }

  @Delete(':id/members/:userId') @RequirePermissions('projects:manage_members')
  removeMember(@Param('id', id) pid: string, @Param('userId', id) uid: string) { return this.svc.removeMember(pid, uid); }
}

@Controller('client-projects')
export class ClientProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get() @RequirePermissions('projects:read')
  list(@Query(new ZodPipe(linksQuery)) q: z.infer<typeof linksQuery>) { return this.svc.listClientProjects(q); }

  @Post() @RequirePermissions('clients:update')
  link(@Body(new ZodPipe(clientProjectCreateSchema)) b: ClientProjectCreateInput) { return this.svc.link(b); }

  @Patch(':id') @RequirePermissions('clients:update')
  update(@Param('id', id) cpid: string, @Body(new ZodPipe(clientProjectUpdateSchema)) b: ClientProjectUpdateInput) { return this.svc.updateLink(cpid, b); }

  @Delete(':id') @RequirePermissions('clients:update')
  unlink(@Param('id', id) cpid: string) { return this.svc.unlink(cpid); }
}

@Module({ controllers: [ProjectsController, ClientProjectsController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
