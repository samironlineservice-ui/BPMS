import { Module } from '@nestjs/common';
import { PlatformModule } from './platform/platform.module.js';
import { AuditLogModule } from './modules/audit-log/audit-log.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { GatewaysModule } from './modules/gateways/gateways.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { RequestsModule } from './modules/requests/requests.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({
  imports: [PlatformModule, AuthModule, UsersModule, RolesModule, AuditLogModule, ClientsModule, ProjectsModule, FilesModule, FinanceModule, ApprovalsModule, BillingModule, GatewaysModule, DevicesModule, AnalyticsModule, SettingsModule, RequestsModule, PortalModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
