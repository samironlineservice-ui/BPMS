import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  artifactCreateSchema, type ArtifactCreateInput, deploymentCreateSchema, type DeploymentCreateInput, deviceClassEnum, deviceCreateSchema, type DeviceCreateInput,
  deviceOwnerEnum, deviceStatusEnum, deviceUpdateSchema, type DeviceUpdateInput, installationCreateSchema, type InstallationCreateInput, installationUpdateSchema,
  type InstallationUpdateInput, listQuerySchema, platformEnum, promoteSchema, releaseCreateSchema, type ReleaseCreateInput, releaseNotesSchema, revokeSchema,
  targetUpdateSchema, type TargetUpdateInput,
} from '@ads/contracts';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { forbidden } from '../../platform/errors.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { FilesModule } from '../files/files.module.js';
import { DeploymentsService } from './deployments.service.js';
import { DevicesService } from './devices.service.js';
import { ReleasesService } from './releases.service.js';

const id = new ParseUUIDPipe();
const deviceQuery = listQuerySchema.extend({
  clientId: z.uuid().optional(), status: deviceStatusEnum.optional(), deviceClass: deviceClassEnum.optional(), platform: platformEnum.optional(), ownerType: deviceOwnerEnum.optional(),
});
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED', 'DECOMMISSIONED']), reason: z.string().trim().max(500).optional(), rowVersion: z.number().int() });
const releaseQuery = listQuerySchema.extend({
  projectId: z.uuid().optional(), componentId: z.uuid().optional(), status: z.enum(['DRAFT', 'READY', 'PUBLISHED', 'DEPRECATED', 'REVOKED']).optional(),
});
const depQuery = listQuerySchema.extend({
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  projectId: z.uuid().optional(), releaseId: z.uuid().optional(),
});
const reasonOpt = z.object({ reason: z.string().trim().max(500).optional() });

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get() @RequirePermissions('devices:read')
  list(@Query(new ZodPipe(deviceQuery)) q: z.infer<typeof deviceQuery>) { return this.devices.list(q); }

  @Get('tags') @RequirePermissions('devices:read')
  tags() { return this.devices.tags(); }

  @Get(':id') @RequirePermissions('devices:read')
  get(@Param('id', id) did: string) { return this.devices.get(did); }

  @Post() @RequirePermissions('devices:create')
  create(@Body(new ZodPipe(deviceCreateSchema)) b: DeviceCreateInput) { return this.devices.create(b); }

  @Patch(':id') @RequirePermissions('devices:update')
  update(@Param('id', id) did: string, @Body(new ZodPipe(deviceUpdateSchema)) b: DeviceUpdateInput) { return this.devices.update(did, b); }

  @Post(':id/status') @RequirePermissions('devices:update')
  status(@Param('id', id) did: string, @Body(new ZodPipe(statusSchema)) b: z.infer<typeof statusSchema>, @Auth() a: AuthContext) {
    if (b.status === 'DECOMMISSIONED' && !a.permissions.has('devices:decommission')) throw forbidden("Ruxsat yo'q: devices:decommission");
    return this.devices.setStatus(did, b.status, b.reason ?? null, b.rowVersion);
  }

  @Post(':id/installations') @RequirePermissions('devices:update')
  addInstallation(@Param('id', id) did: string, @Body(new ZodPipe(installationCreateSchema)) b: InstallationCreateInput) { return this.devices.addInstallation(did, b); }

  @Patch(':id/installations/:installationId') @RequirePermissions('devices:update')
  updateInstallation(@Param('id', id) did: string, @Param('installationId', id) iid: string, @Body(new ZodPipe(installationUpdateSchema)) b: InstallationUpdateInput) {
    return this.devices.updateInstallation(did, iid, b);
  }
}

@Controller('components')
export class ComponentInstallationsController {
  constructor(private readonly devices: DevicesService) {}

  @Get(':componentId/installations') @RequirePermissions('devices:read')
  installations(@Param('componentId', id) cid: string, @Query(new ZodPipe(z.object({ clientId: z.uuid().optional() }))) q: { clientId?: string }) {
    return this.devices.installationsForComponent(cid, q.clientId);
  }
}

@Controller('releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get() @RequirePermissions('releases:read')
  list(@Query(new ZodPipe(releaseQuery)) q: z.infer<typeof releaseQuery>) { return this.releases.list(q); }

  @Get(':id') @RequirePermissions('releases:read')
  get(@Param('id', id) rid: string) { return this.releases.get(rid); }

  @Post() @RequirePermissions('releases:create')
  create(@Body(new ZodPipe(releaseCreateSchema)) b: ReleaseCreateInput, @Auth() a: AuthContext) { return this.releases.create(b, a); }

  @Patch(':id/notes') @RequirePermissions('releases:create')
  notes(@Param('id', id) rid: string, @Body(new ZodPipe(releaseNotesSchema)) b: { notes: string }) { return this.releases.updateNotes(rid, b.notes); }

  @Post(':id/artifacts') @RequirePermissions('releases:create')
  addArtifact(@Param('id', id) rid: string, @Body(new ZodPipe(artifactCreateSchema)) b: ArtifactCreateInput) { return this.releases.addArtifact(rid, b); }

  @Delete(':id/artifacts/:artifactId') @RequirePermissions('releases:create')
  removeArtifact(@Param('id', id) rid: string, @Param('artifactId', id) aid: string) { return this.releases.removeArtifact(rid, aid); }

  @Post(':id/ready') @RequirePermissions('releases:publish')
  ready(@Param('id', id) rid: string) { return this.releases.markReady(rid); }

  @Post(':id/promote') @RequirePermissions('releases:publish')
  promote(@Param('id', id) rid: string, @Body(new ZodPipe(promoteSchema)) b: { channelKey: string }, @Auth() a: AuthContext) { return this.releases.promote(rid, b.channelKey, a); }

  @Post(':id/deprecate') @RequirePermissions('releases:publish')
  deprecate(@Param('id', id) rid: string) { return this.releases.deprecate(rid); }

  @Post(':id/revoke') @RequirePermissions('releases:revoke')
  revoke(@Param('id', id) rid: string, @Body(new ZodPipe(revokeSchema)) b: { reason: string }) { return this.releases.revoke(rid, b.reason); }

  @Delete(':id') @RequirePermissions('releases:create')
  remove(@Param('id', id) rid: string) { return this.releases.remove(rid); }
}

@Controller('deployments')
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get() @RequirePermissions('deployments:read')
  list(@Query(new ZodPipe(depQuery)) q: z.infer<typeof depQuery>) { return this.deployments.list(q); }

  @Get(':id') @RequirePermissions('deployments:read')
  get(@Param('id', id) did: string) { return this.deployments.get(did); }

  @Post() @RequirePermissions('deployments:create')
  create(@Body(new ZodPipe(deploymentCreateSchema)) b: DeploymentCreateInput, @Auth() a: AuthContext) { return this.deployments.create(b, a); }

  @Post(':id/submit') @RequirePermissions('deployments:create')
  submit(@Param('id', id) did: string, @Auth() a: AuthContext) { return this.deployments.submit(did, a); }

  @Post(':id/start') @RequirePermissions('deployments:update')
  start(@Param('id', id) did: string) { return this.deployments.transition(did, 'start'); }

  @Post(':id/pause') @RequirePermissions('deployments:update')
  pause(@Param('id', id) did: string) { return this.deployments.transition(did, 'pause'); }

  @Post(':id/resume') @RequirePermissions('deployments:update')
  resume(@Param('id', id) did: string) { return this.deployments.transition(did, 'resume'); }

  @Post(':id/cancel') @RequirePermissions('deployments:update')
  cancel(@Param('id', id) did: string, @Body(new ZodPipe(reasonOpt)) b: { reason?: string }) { return this.deployments.transition(did, 'cancel', b.reason); }

  @Patch(':id/targets/:targetId') @RequirePermissions('deployments:update')
  updateTarget(@Param('id', id) did: string, @Param('targetId', id) tid: string, @Body(new ZodPipe(targetUpdateSchema)) b: TargetUpdateInput, @Auth() a: AuthContext) {
    return this.deployments.updateTarget(did, tid, b, a);
  }

  @Get(':id/targets/:targetId/events') @RequirePermissions('deployments:read')
  events(@Param('id', id) did: string, @Param('targetId', id) tid: string) { return this.deployments.targetEvents(did, tid); }
}

@Module({
  imports: [ApprovalsModule, FilesModule],
  controllers: [DevicesController, ComponentInstallationsController, ReleasesController, DeploymentsController],
  providers: [DevicesService, ReleasesService, DeploymentsService],
  exports: [DevicesService, ReleasesService, DeploymentsService],
})
export class DevicesModule {}
