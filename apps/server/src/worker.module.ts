import { Global, Module } from '@nestjs/common';
import { BillingModule } from './modules/billing/billing.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { GatewaysModule } from './modules/gateways/gateways.module.js';
import { NotificationsWorkerModule } from './modules/notifications/notifications.module.js';
import { WorkerPlatformModule } from './platform/platform.module.js';
import { EventBus } from './worker/event-bus.js';
import { SchedulerService } from './worker/scheduler.service.js';

@Global()
@Module({ providers: [EventBus], exports: [EventBus] })
export class EventBusModule {}

@Module({ imports: [WorkerPlatformModule, EventBusModule, FinanceModule, BillingModule, GatewaysModule, NotificationsWorkerModule], providers: [SchedulerService] })
export class WorkerModule {}
