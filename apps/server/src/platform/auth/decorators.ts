import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PermissionKey } from '@ads/contracts';
import type { AuthContext } from './auth.types.js';

export const IS_PUBLIC = 'ads:public';
export const ALLOW_MFA_PENDING = 'ads:mfa-pending';
export const PERMISSIONS_KEY = 'ads:permissions';
export const SKIP_CSRF = 'ads:skip-csrf';

/** Autentifikatsiyasiz (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** To'lov tizimlarining webhook'lari: CSRF sarlavhasi yo'q — o'rniga provayder imzosi/autentifikatsiyasi tekshiriladi. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
/** Parol kiritilgan, lekin MFA hali tasdiqlanmagan sessiya uchun ruxsat (MFA endpointlari). */
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING, true);
/** Kerakli ruxsatlar (hammasi bo'lishi shart). */
export const RequirePermissions = (...perms: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  return req.auth!;
});
