import { Body, Controller, Get, Injectable, Module, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { AuditService, diff } from '../../platform/audit.service.js';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { notFound } from '../../platform/errors.js';
import { mfaEnforced } from '../../config/env.js';
import { fromDbDate } from '../../platform/time.js';
import { ZodPipe } from '../../platform/zod.pipe.js';

const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
export const companySchema = z.object({
  name: z.string().trim().min(1).max(80),
  legalName: opt(200),
  tagline: opt(120),
  tin: z.string().trim().regex(/^\d{9}$/, 'STIR 9 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  address: opt(300),
  bankName: opt(120),
  bankMfo: z.string().trim().regex(/^\d{5}$/, 'MFO 5 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  bankAccount: z.string().trim().regex(/^\d{20}$/, '20 ta raqam').optional().nullable().or(z.literal('').transform(() => null)),
  phone: opt(30),
  email: z.email().optional().nullable().or(z.literal('').transform(() => null)),
});
const policySchema = z.object({ enabled: z.boolean(), allowSelfApproval: z.boolean(), requiredApprovals: z.number().int().min(1).max(3) });

@Injectable()
export class SettingsService {
  constructor(private readonly db: Db, private readonly audit: AuditService) {}

  async company() {
    const s = await this.db.setting.findUnique({ where: { key: 'company.profile' } });
    return { name: 'ADS', ...((s?.value ?? {}) as object) } as z.infer<typeof companySchema>;
  }

  async setCompany(input: z.infer<typeof companySchema>, auth: AuthContext) {
    const before = await this.company();
    await this.db.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: 'company.profile' }, create: { key: 'company.profile', value: input, updatedById: auth.userId },
        update: { value: input, updatedById: auth.userId, rowVersion: { increment: 1 } },
      });
      await this.audit.record(tx, { action: 'settings.company_updated', resourceType: 'setting', changes: diff(before as Record<string, unknown>, input) });
    });
    return { ok: true };
  }

  async policies() {
    const rows = await this.db.approvalPolicy.findMany({ orderBy: { key: 'asc' } });
    return rows.map((p) => ({ key: p.key, description: p.description, approverPermission: p.approverPermission, requiredApprovals: p.requiredApprovals, enabled: p.enabled, allowSelfApproval: p.allowSelfApproval }));
  }

  async setPolicy(key: string, input: z.infer<typeof policySchema>) {
    const before = await this.db.approvalPolicy.findUnique({ where: { key } });
    if (!before) throw notFound('Siyosat');
    await this.db.$transaction(async (tx) => {
      const after = await tx.approvalPolicy.update({ where: { key }, data: input });
      await this.audit.record(tx, { action: 'settings.policy_updated', resourceType: 'approval_policy', changes: diff(before, after), metadata: { key } });
    });
    return { ok: true };
  }

  async system() {
    const [outbox, run, rate, periods, users] = await Promise.all([
      this.db.$queryRaw<{ pending: bigint; failing: bigint; total: bigint }[]>`
        SELECT count(*) FILTER (WHERE published_at IS NULL) AS pending, count(*) FILTER (WHERE published_at IS NULL AND attempts > 0) AS failing, count(*) AS total FROM outbox_events`,
      this.db.billingRun.findFirst({ orderBy: { runDate: 'desc' } }),
      this.db.fxRate.findFirst({ orderBy: { effectiveDate: 'desc' } }),
      this.db.financialPeriod.count({ where: { closedAt: null } }),
      this.db.user.count({ where: { status: 'ACTIVE' } }),
    ]);
    const o = outbox[0]!;
    return {
      dbTime: new Date().toISOString(),
      outbox: { pending: Number(o.pending), failing: Number(o.failing), total: Number(o.total) },
      lastBillingRun: run ? { date: fromDbDate(run.runDate), status: run.status, invoiced: run.invoiced, failed: run.failed } : null,
      lastFxRate: rate ? { date: fromDbDate(rate.effectiveDate), rate: rate.rate.toString(), source: rate.source } : null,
      openPeriods: periods, activeUsers: users, mfaEnabled: mfaEnforced,
    };
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get('company') @RequirePermissions('settings:read')
  company() { return this.svc.company(); }

  @Put('company') @RequirePermissions('settings:manage')
  setCompany(@Body(new ZodPipe(companySchema)) b: z.infer<typeof companySchema>, @Auth() a: AuthContext) { return this.svc.setCompany(b, a); }

  @Get('approval-policies') @RequirePermissions('settings:read')
  policies() { return this.svc.policies(); }

  @Put('approval-policies/:key') @RequirePermissions('settings:manage')
  setPolicy(@Param('key', new ZodPipe(z.string().max(60))) key: string, @Body(new ZodPipe(policySchema)) b: z.infer<typeof policySchema>) { return this.svc.setPolicy(key, b); }

  @Get('system') @RequirePermissions('settings:read')
  system() { return this.svc.system(); }
}

@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
