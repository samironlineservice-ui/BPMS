import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { acceptInviteSchema, type AcceptInviteInput, changePasswordSchema, loginSchema, type LoginInput, totpCodeSchema, type TotpCodeInput } from '@ads/contracts';
import { AllowMfaPending, Auth, Public } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.auth.login(body, req, reply);
  }

  @Public()
  @Get('invite/:token')
  inviteInfo(@Param('token') token: string) {
    return this.auth.inviteInfo(token);
  }

  @Public()
  @Post('invite/accept')
  @HttpCode(200)
  acceptInvite(@Body(new ZodPipe(acceptInviteSchema)) body: AcceptInviteInput) {
    return this.auth.acceptInvite(body);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(@Body(new ZodPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string }, @Auth() a: AuthContext) {
    return this.auth.changePassword(a, body.currentPassword, body.newPassword);
  }

  @AllowMfaPending()
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@Auth() a: AuthContext) {
    return this.auth.mfaSetup(a);
  }

  @AllowMfaPending()
  @Post('mfa/confirm')
  @HttpCode(200)
  mfaConfirm(@Auth() a: AuthContext, @Body(new ZodPipe(totpCodeSchema)) body: TotpCodeInput) {
    return this.auth.mfaConfirm(a, body.code);
  }

  @AllowMfaPending()
  @Post('mfa/verify')
  @HttpCode(200)
  mfaVerify(@Auth() a: AuthContext, @Body(new ZodPipe(totpCodeSchema)) body: TotpCodeInput) {
    return this.auth.mfaVerify(a, body.code);
  }

  @AllowMfaPending()
  @Post('logout')
  @HttpCode(200)
  logout(@Auth() a: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.auth.logout(a, reply);
  }

  @AllowMfaPending()
  @Get('me')
  me(@Auth() a: AuthContext) {
    return this.auth.me(a);
  }
}
