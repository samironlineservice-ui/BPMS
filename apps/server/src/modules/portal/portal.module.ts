import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  acceptInviteSchema, type AcceptInviteInput, changePasswordSchema, currency, dateString, portalLoginSchema, portalRegisterSchema, type PortalRegisterInput,
  portalTeamInviteSchema, type PortalTeamInviteInput,
  portalUserInviteSchema, type PortalUserInviteInput, requestCreateSchema, type RequestCreateInput, requestMessageSchema,
} from '@ads/contracts';
import { Auth, Public, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { BillingModule } from '../billing/billing.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { FilesModule } from '../files/files.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { GatewaysModule } from '../gateways/gateways.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { FINANCE_ROLES, Portal, type PortalContext, PortalGuard, PortalRoles, PortalSessionService, WRITE_ROLES } from './portal-auth.js';
import { PortalPayController } from './portal-pay.controller.js';
import { PortalService } from './portal.service.js';
import { PortalUsersService } from './portal-users.service.js';

const id = new ParseUUIDPipe();
const statementQuery = z.object({ currency: currency.default('UZS'), from: dateString.optional(), to: dateString.optional() });
type StatementQuery = z.infer<typeof statementQuery>;
const pdfReply = (reply: FastifyReply, buffer: Buffer, filename: string) =>
  reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="${filename}"`).header('cache-control', 'private, no-store').send(buffer);

// ── Xodimlar tomoni: mijozning kabinet foydalanuvchilari ──
@Controller()
export class PortalUsersController {
  constructor(private readonly svc: PortalUsersService) {}

  @Get('clients/:clientId/portal-users') @RequirePermissions('portal_users:read')
  list(@Param('clientId', id) cid: string) { return this.svc.list(cid); }

  @Post('clients/:clientId/portal-users') @RequirePermissions('portal_users:invite')
  invite(@Param('clientId', id) cid: string, @Body(new ZodPipe(portalUserInviteSchema)) b: PortalUserInviteInput, @Auth() a: AuthContext) { return this.svc.invite(cid, b, a); }

  @Post('portal-users/:id/reinvite') @RequirePermissions('portal_users:invite')
  reinvite(@Param('id', id) pid: string, @Auth() a: AuthContext) { return this.svc.reinvite(pid, a.userId); }

  @Post('portal-users/:id/deactivate') @RequirePermissions('portal_users:deactivate')
  deactivate(@Param('id', id) pid: string) { return this.svc.setStatus(pid, 'DEACTIVATED'); }

  @Post('portal-users/:id/activate') @RequirePermissions('portal_users:deactivate')
  activate(@Param('id', id) pid: string) { return this.svc.setStatus(pid, 'ACTIVE'); }
}

// ── Kabinet: kirish ──
@Public()
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private readonly svc: PortalService, private readonly sessions: PortalSessionService) {}

  @Post('login') @HttpCode(200)
  login(@Body(new ZodPipe(portalLoginSchema)) b: z.infer<typeof portalLoginSchema>, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.svc.login(b.email, b.password, req, reply);
  }

  /** Kirish sahifasi uchun: ro'yxatdan o'tish yoqilganmi. */
  @Get('config')
  config() { return this.svc.config(); }

  @Post('register') @HttpCode(200)
  register(@Body(new ZodPipe(portalRegisterSchema)) b: PortalRegisterInput, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.svc.register(b, req, reply);
  }

  @Post('logout') @HttpCode(200)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = req.cookies?.ads_psid ?? req.cookies?.['__Host-ads_psid'];
    if (token) await this.sessions.revoke(token);
    this.sessions.clear(reply);
    return { ok: true };
  }

  @Get('invite/:token')
  async invite(@Param('token') token: string) {
    const { email, fullName, clientName } = await this.svc.inviteInfo(token);
    return { email, fullName, clientName };
  }

  @Post('invite/accept') @HttpCode(200)
  accept(@Body(new ZodPipe(acceptInviteSchema)) b: AcceptInviteInput) { return this.svc.acceptInvite(b); }

  @Get('me') @UseGuards(PortalGuard)
  me(@Portal() p: PortalContext) { return this.svc.me(p); }

  @Post('password') @HttpCode(200) @UseGuards(PortalGuard)
  password(@Body(new ZodPipe(changePasswordSchema)) b: z.infer<typeof changePasswordSchema>, @Portal() p: PortalContext) {
    return this.svc.changePassword(p, b.currentPassword, b.newPassword);
  }
}

// ── Kabinet: ma'lumotlar (har endpoint — rol bo'yicha; clientId FAQAT sessiyadan) ──
@Public()
@UseGuards(PortalGuard)
@Controller('portal')
export class PortalController {
  constructor(private readonly svc: PortalService) {}

  @Get('dashboard') dashboard(@Portal() p: PortalContext) { return this.svc.dashboard(p); }
  @Get('company') company() { return this.svc.company(); }

  @Get('summary') @PortalRoles(...FINANCE_ROLES) summary(@Portal() p: PortalContext) { return this.svc.summary(p); }
  @Get('invoices') @PortalRoles(...FINANCE_ROLES)
  invoices(@Portal() p: PortalContext, @Query(new ZodPipe(z.object({ status: z.enum(['open', 'overdue', 'all']).optional() }))) q: { status?: string }) { return this.svc.invoices(p, q.status); }
  @Get('invoices/:id') @PortalRoles(...FINANCE_ROLES) invoice(@Portal() p: PortalContext, @Param('id', id) iid: string) { return this.svc.invoiceDetail(p, iid); }

  @Get('invoices/:id/pdf') @PortalRoles(...FINANCE_ROLES)
  async pdf(@Portal() p: PortalContext, @Param('id', id) iid: string, @Res() reply: FastifyReply) {
    const { file, stream } = await this.svc.invoicePdf(p, iid);
    return reply.header('content-type', 'application/pdf').header('content-length', file.sizeBytes.toString())
      .header('content-disposition', `inline; filename="${file.originalName}"`).header('cache-control', 'private, no-store').send(stream);
  }

  @Get('payments') @PortalRoles(...FINANCE_ROLES) payments(@Portal() p: PortalContext) { return this.svc.payments(p); }
  @Get('statement') @PortalRoles(...FINANCE_ROLES) statement(@Portal() p: PortalContext, @Query(new ZodPipe(statementQuery)) q: StatementQuery) { return this.svc.statement(p, q); }

  @Get('statement/pdf') @PortalRoles(...FINANCE_ROLES)
  async statementPdf(@Portal() p: PortalContext, @Query(new ZodPipe(statementQuery)) q: StatementQuery, @Res() reply: FastifyReply) {
    const { buffer, filename } = await this.svc.statementPdf(p, q);
    return pdfReply(reply, buffer, filename);
  }

  @Get('subscriptions') subscriptions(@Portal() p: PortalContext) { return this.svc.subscriptions(p); }
  @Get('subscriptions/:id') subscription(@Portal() p: PortalContext, @Param('id', id) sid: string) { return this.svc.subscriptionDetail(p, sid); }
  @Get('devices') devices(@Portal() p: PortalContext) { return this.svc.devices(p); }

  @Get('requests') requests(@Portal() p: PortalContext) { return this.svc.requests(p); }
  @Get('requests/:id') request(@Portal() p: PortalContext, @Param('id', id) rid: string) { return this.svc.requestDetail(p, rid); }
  @Post('requests') @PortalRoles(...WRITE_ROLES)
  createRequest(@Portal() p: PortalContext, @Body(new ZodPipe(requestCreateSchema)) b: RequestCreateInput) { return this.svc.createRequest(p, b); }
  @Post('requests/:id/messages') @PortalRoles(...WRITE_ROLES)
  reply(@Portal() p: PortalContext, @Param('id', id) rid: string, @Body(new ZodPipe(requestMessageSchema.pick({ body: true }))) b: { body: string }) { return this.svc.replyRequest(p, rid, b.body); }
  @Post('requests/:id/close') @HttpCode(200) @PortalRoles(...WRITE_ROLES)
  close(@Portal() p: PortalContext, @Param('id', id) rid: string) { return this.svc.closeRequest(p, rid); }

  @Get('team') @PortalRoles('OWNER') team(@Portal() p: PortalContext) { return this.svc.team(p); }
  @Post('team') @PortalRoles('OWNER')
  teamInvite(@Portal() p: PortalContext, @Body(new ZodPipe(portalTeamInviteSchema)) b: PortalTeamInviteInput) { return this.svc.teamInvite(p, b); }
  @Post('team/:id/reinvite') @PortalRoles('OWNER') teamReinvite(@Portal() p: PortalContext, @Param('id', id) uid: string) { return this.svc.teamReinvite(p, uid); }
  @Post('team/:id/deactivate') @HttpCode(200) @PortalRoles('OWNER') teamDeactivate(@Portal() p: PortalContext, @Param('id', id) uid: string) { return this.svc.teamDeactivate(p, uid); }
}

@Module({
  imports: [FinanceModule, BillingModule, FilesModule, RequestsModule, ClientsModule, GatewaysModule],
  controllers: [PortalUsersController, PortalAuthController, PortalController, PortalPayController],
  providers: [PortalUsersService, PortalService, PortalSessionService, PortalGuard],
})
export class PortalModule {}
