import { Injectable } from '@nestjs/common';
import { parseMoney, type PlanCreateInput, type PlanItem, type PlanPriceCreateInput, type PlanUpdateInput } from '@ads/contracts';
import { AuditService } from '../../platform/audit.service.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { conflict, notFound } from '../../platform/errors.js';
import { dbDate, fromDbDate } from '../../platform/time.js';

@Injectable()
export class PlansService {
  constructor(private readonly db: Db, private readonly audit: AuditService) {}

  async list(projectId?: string): Promise<PlanItem[]> {
    const plans = await this.db.plan.findMany({
      where: projectId ? { projectId } : {},
      include: { prices: { include: { _count: { select: { revisionItems: true } } }, orderBy: [{ currency: 'asc' }, { validFrom: 'desc' }] } },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return plans.map((p) => ({
      id: p.id, projectId: p.projectId, code: p.code, name: p.name, description: p.description, intervalMonths: p.intervalMonths, isActive: p.isActive,
      isPublic: p.isPublic, features: p.features, sortOrder: p.sortOrder,
      prices: p.prices.map((x) => ({
        id: x.id, currency: x.currency, unitAmountMinor: x.unitAmountMinor.toString(), vatRateBp: x.vatRateBp, validFrom: fromDbDate(x.validFrom)!,
        validTo: fromDbDate(x.validTo), ikpuCode: x.ikpuCode, inUse: x._count.revisionItems > 0,
      })),
    }));
  }

  async create(input: PlanCreateInput) {
    const project = await this.db.project.findFirst({ where: { id: input.projectId, deletedAt: null } });
    if (!project) throw notFound('Loyiha');
    if (await this.db.plan.findUnique({ where: { projectId_code: { projectId: input.projectId, code: input.code } } })) throw conflict('Bunday kodli tarif mavjud');
    return this.db.$transaction(async (tx) => {
      const p = await tx.plan.create({ data: input });
      await this.audit.record(tx, { action: 'plan.created', resourceType: 'project', resourceId: input.projectId, metadata: { planId: p.id, code: p.code } });
      return { id: p.id };
    });
  }

  async update(id: string, input: PlanUpdateInput) {
    const before = await this.db.plan.findUnique({ where: { id } });
    if (!before) throw notFound('Tarif');
    await this.db.$transaction(async (tx) => {
      await tx.plan.update({ where: { id }, data: input });
      await this.audit.record(tx, { action: 'plan.updated', resourceType: 'project', resourceId: before.projectId, metadata: { planId: id, ...input } });
    });
    return { ok: true };
  }

  /** Yangi narx: joriy (ochiq) narx shu sanada yopiladi. Mavjud obunalar eski narxda qoladi (snapshot). */
  async addPrice(planId: string, input: PlanPriceCreateInput, auth: AuthContext) {
    const plan = await this.db.plan.findUnique({ where: { id: planId } });
    if (!plan) throw notFound('Tarif');
    return this.db.$transaction(async (tx) => {
      const open = await tx.planPrice.findFirst({ where: { planId, currency: input.currency, validTo: null } });
      if (open) {
        if (fromDbDate(open.validFrom)! >= input.validFrom) throw conflict(`Yangi narx sanasi joriy narx boshlanishidan (${fromDbDate(open.validFrom)}) keyin bo'lishi kerak`);
        await tx.planPrice.update({ where: { id: open.id }, data: { validTo: dbDate(input.validFrom) } });
      }
      const p = await tx.planPrice.create({
        data: {
          planId, currency: input.currency, unitAmountMinor: parseMoney(input.unitAmount), vatRateBp: input.vatRateBp, validFrom: dbDate(input.validFrom),
          ikpuCode: input.ikpuCode ?? null, packageCode: input.packageCode, createdById: auth.userId,
        },
      });
      await this.audit.record(tx, { action: 'plan.price_added', resourceType: 'project', resourceId: plan.projectId, metadata: { planId, priceId: p.id, ...input } });
      return { id: p.id };
    });
  }
}
