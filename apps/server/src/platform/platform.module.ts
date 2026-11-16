import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from './audit.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { PermissionService } from './auth/permission.service.js';
import { SessionService } from './auth/session.service.js';
import { Db, PortalDb } from './db.service.js';
import { OutboxService } from './outbox.service.js';
import { SequenceService } from './sequence.service.js';

const services = [Db, PortalDb, AuditService, OutboxService, SequenceService, SessionService, PermissionService];

@Global()
@Module({
  providers: [...services, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: services,
})
export class PlatformModule {}

/** Worker uchun (guard'siz). */
@Global()
@Module({ providers: services, exports: services })
export class WorkerPlatformModule {}
