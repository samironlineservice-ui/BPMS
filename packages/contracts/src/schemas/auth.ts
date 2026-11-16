import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, '6 xonali kod') });
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12, 'Kamida 12 belgi').max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, 'Kamida 12 belgi').max(200),
});

/** Login javobi: keyingi qadam */
export type AuthStep = 'DONE' | 'MFA_VERIFY' | 'MFA_SETUP';

export interface MeResponse {
  user: { id: string; email: string; fullName: string; locale: string; timezone: string };
  mfa: { enabled: boolean; verified: boolean };
  permissions: string[];
  roles: { key: string; name: string; expiresAt: string | null }[];
}
