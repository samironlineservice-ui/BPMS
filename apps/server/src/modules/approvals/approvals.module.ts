import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { approvalDecisionSchema } from '@ads/contracts';
import type { z } from 'zod';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { ApprovalsService } from './approvals.service.js';

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  @Get('inbox') @RequirePermissions('approvals:read')
  inbox(@Auth() a: AuthContext) { return this.svc.inbox(a); }

  @Get('history') @RequirePermissions('approvals:read')
  history() { return this.svc.history(); }

  /** Ruxsat siyosatga qarab tekshiriladi (approverPermission) — xizmat ichida va DB trigger'ida. */
  @Post(':id/decide')
  decide(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(approvalDecisionSchema)) b: z.infer<typeof approvalDecisionSchema>, @Auth() a: AuthContext) {
    return this.svc.decide(id, b.approve, b.comment, a);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Auth() a: AuthContext) { return this.svc.cancel(id, a); }
}

@Module({ controllers: [ApprovalsController], providers: [ApprovalsService], exports: [ApprovalsService] })
export class ApprovalsModule {}
