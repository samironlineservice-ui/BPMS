import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  clientUpdateSchema, type ClientUpdateInput, clientUpsertSchema, type ClientUpsertInput, contactUpsertSchema,
  type ContactUpsertInput, listQuerySchema, noteCreateSchema, siteUpsertSchema, type SiteUpsertInput,
} from '@ads/contracts';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { ClientsService } from './clients.service.js';

const clientsQuery = listQuerySchema.extend({
  status: z.enum(['LEAD', 'ACTIVE', 'SUSPENDED', 'CHURNED', 'ARCHIVED']).optional(),
  tag: z.string().max(40).optional(),
  managerId: z.uuid().optional(),
});
const id = new ParseUUIDPipe();

@Controller('clients')
export class ClientsController {
  constructor(private readonly svc: ClientsService) {}

  @Get() @RequirePermissions('clients:read')
  list(@Query(new ZodPipe(clientsQuery)) q: z.infer<typeof clientsQuery>) { return this.svc.list(q); }

  @Get('tags') @RequirePermissions('clients:read')
  tags() { return this.svc.tags(); }

  @Get(':id') @RequirePermissions('clients:read')
  get(@Param('id', id) cid: string, @Auth() a: AuthContext) { return this.svc.get(cid, a); }

  @Post() @RequirePermissions('clients:create')
  create(@Body(new ZodPipe(clientUpsertSchema)) b: ClientUpsertInput) { return this.svc.create(b); }

  @Patch(':id') @RequirePermissions('clients:update')
  update(@Param('id', id) cid: string, @Body(new ZodPipe(clientUpdateSchema)) b: ClientUpdateInput) { return this.svc.update(cid, b); }

  @Post(':id/archive') @RequirePermissions('clients:archive')
  archive(@Param('id', id) cid: string) { return this.svc.archive(cid); }

  @Post(':id/contacts') @RequirePermissions('clients:update')
  addContact(@Param('id', id) cid: string, @Body(new ZodPipe(contactUpsertSchema)) b: ContactUpsertInput) { return this.svc.addContact(cid, b); }

  @Patch(':id/contacts/:contactId') @RequirePermissions('clients:update')
  updateContact(@Param('id', id) cid: string, @Param('contactId', id) xid: string, @Body(new ZodPipe(contactUpsertSchema)) b: ContactUpsertInput) { return this.svc.updateContact(cid, xid, b); }

  @Delete(':id/contacts/:contactId') @RequirePermissions('clients:update')
  removeContact(@Param('id', id) cid: string, @Param('contactId', id) xid: string) { return this.svc.removeContact(cid, xid); }

  @Post(':id/sites') @RequirePermissions('clients:update')
  addSite(@Param('id', id) cid: string, @Body(new ZodPipe(siteUpsertSchema)) b: SiteUpsertInput) { return this.svc.addSite(cid, b); }

  @Patch(':id/sites/:siteId') @RequirePermissions('clients:update')
  updateSite(@Param('id', id) cid: string, @Param('siteId', id) sid: string, @Body(new ZodPipe(siteUpsertSchema)) b: SiteUpsertInput) { return this.svc.updateSite(cid, sid, b); }

  @Delete(':id/sites/:siteId') @RequirePermissions('clients:update')
  removeSite(@Param('id', id) cid: string, @Param('siteId', id) sid: string) { return this.svc.removeSite(cid, sid); }

  @Get(':id/notes') @RequirePermissions('clients:read')
  notes(@Param('id', id) cid: string) { return this.svc.notes(cid); }

  @Post(':id/notes') @RequirePermissions('clients:update')
  addNote(@Param('id', id) cid: string, @Body(new ZodPipe(noteCreateSchema)) b: z.infer<typeof noteCreateSchema>, @Auth() a: AuthContext) { return this.svc.addNote(cid, b.body, b.pinned, a); }

  @Patch(':id/notes/:noteId') @RequirePermissions('clients:update')
  pinNote(@Param('id', id) cid: string, @Param('noteId', id) nid: string, @Body(new ZodPipe(z.object({ pinned: z.boolean() }))) b: { pinned: boolean }) { return this.svc.pinNote(cid, nid, b.pinned); }
}

@Module({ controllers: [ClientsController], providers: [ClientsService], exports: [ClientsService] })
export class ClientsModule {}
