import { Body, Controller, Get, Injectable, Module, type OnModuleInit, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  allocateSchema, type AllocateInput, creditNoteRequestSchema, currency, dateString, listQuerySchema, oneTimeInvoiceSchema, type OneTimeInvoiceInput, parseMoney,
  paymentRecordSchema, type PaymentRecordInput, paymentRejectSchema, planCreateSchema, type PlanCreateInput, planPriceCreateSchema, type PlanPriceCreateInput,
  planUpdateSchema, type PlanUpdateInput, refundRequestSchema, subscriptionCancelSchema, subscriptionChangeSchema, type SubscriptionChangeInput,
  subscriptionCreateSchema, type SubscriptionCreateInput, subscriptionReasonSchema, subscriptionTermsSchema, voidRequestSchema,
} from '@ads/contracts';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { Db } from '../../platform/db.service.js';
import { conflict, notFound } from '../../platform/errors.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { FilesModule } from '../files/files.module.js';
import { FilesService } from '../files/files.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { BillingRunService } from './billing-run.service.js';
import { DunningService } from './dunning.service.js';
import { InvoicingService } from './invoicing.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { PaymentsService } from './payments.service.js';
import { PlansService } from './plans.service.js';
import { BillingQueries } from './queries.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

const id = new ParseUUIDPipe();
const bool = z.enum(['true', 'false']).transform((v) => v === 'true').optional();
const subStatus = z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']);
const subsQuery = listQuerySchema.extend({ status: subStatus.optional(), clientId: z.uuid().optional(), projectId: z.uuid().optional() });
const invQuery = listQuerySchema.extend({
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']).optional(), clientId: z.uuid().optional(), subscriptionId: z.uuid().optional(),
  currency: currency.optional(), overdue: bool, kind: z.enum(['RECURRING', 'PRORATION', 'ONE_TIME']).optional(),
});
const payQuery = listQuerySchema.extend({
  status: z.enum(['PENDING_APPROVAL', 'POSTED', 'REJECTED']).optional(), clientId: z.uuid().optional(),
  method: z.enum(['PAYME', 'CLICK', 'UZUM', 'CASH', 'BANK_TRANSFER', 'CARD_TERMINAL']).optional(), currency: currency.optional(),
});
const decideSchema = z.object({ approve: z.boolean(), reason: z.string().trim().max(500).optional() });
const completeSchema = z.object({ succeeded: z.boolean() });
const rowVersionSchema = z.object({ rowVersion: z.number().int() });
const monthParam = z.string().regex(/^\d{4}-\d{2}(-01)?$/);

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get() @RequirePermissions('plans:read')
  list(@Query(new ZodPipe(z.object({ projectId: z.uuid().optional() }))) q: { projectId?: string }) { return this.plans.list(q.projectId); }

  @Post() @RequirePermissions('plans:manage')
  create(@Body(new ZodPipe(planCreateSchema)) b: PlanCreateInput) { return this.plans.create(b); }

  @Put(':id') @RequirePermissions('plans:manage')
  update(@Param('id', id) pid: string, @Body(new ZodPipe(planUpdateSchema)) b: PlanUpdateInput) { return this.plans.update(pid, b); }

  @Post(':id/prices') @RequirePermissions('plans:manage')
  addPrice(@Param('id', id) pid: string, @Body(new ZodPipe(planPriceCreateSchema)) b: PlanPriceCreateInput, @Auth() a: AuthContext) { return this.plans.addPrice(pid, b, a); }
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService, private readonly q: BillingQueries) {}

  @Get() @RequirePermissions('subscriptions:read')
  list(@Query(new ZodPipe(subsQuery)) q: z.infer<typeof subsQuery>) { return this.q.subscriptions(q); }

  @Get(':id') @RequirePermissions('subscriptions:read')
  get(@Param('id', id) sid: string) { return this.q.subscription(sid); }

  @Post() @RequirePermissions('subscriptions:create')
  create(@Body(new ZodPipe(subscriptionCreateSchema)) b: SubscriptionCreateInput) { return this.subs.create(b); }

  @Post(':id/change') @RequirePermissions('subscriptions:update')
  change(@Param('id', id) sid: string, @Body(new ZodPipe(subscriptionChangeSchema)) b: SubscriptionChangeInput, @Auth() a: AuthContext) { return this.subs.change(sid, b, a); }

  @Post(':id/cancel-change') @RequirePermissions('subscriptions:update')
  cancelChange(@Param('id', id) sid: string) { return this.subs.cancelPendingChange(sid); }

  @Post(':id/cancel') @RequirePermissions('subscriptions:cancel')
  cancel(@Param('id', id) sid: string, @Body(new ZodPipe(subscriptionCancelSchema)) b: z.infer<typeof subscriptionCancelSchema>) { return this.subs.cancel(sid, b.atPeriodEnd, b.reason, b.rowVersion); }

  @Post(':id/resume') @RequirePermissions('subscriptions:cancel')
  resume(@Param('id', id) sid: string, @Body(new ZodPipe(rowVersionSchema)) b: { rowVersion: number }) { return this.subs.resume(sid, b.rowVersion); }

  @Post(':id/suspend') @RequirePermissions('subscriptions:suspend')
  suspend(@Param('id', id) sid: string, @Body(new ZodPipe(subscriptionReasonSchema)) b: z.infer<typeof subscriptionReasonSchema>) { return this.subs.suspend(sid, b.reason, b.rowVersion); }

  @Patch(':id/terms') @RequirePermissions('subscriptions:update')
  terms(@Param('id', id) sid: string, @Body(new ZodPipe(subscriptionTermsSchema)) b: z.infer<typeof subscriptionTermsSchema>) { return this.subs.updateTerms(sid, b.paymentTermsDays, b.graceDays, b.rowVersion); }

  @Post(':id/bill') @RequirePermissions('invoices:issue')
  bill(@Param('id', id) sid: string) { return this.subs.billNow(sid); }
}

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly db: Db, private readonly q: BillingQueries, private readonly invoicing: InvoicingService, private readonly payments: PaymentsService,
    private readonly approvals: ApprovalsService, private readonly pdf: InvoicePdfService, private readonly files: FilesService,
  ) {}

  @Get(':id/pdf') @RequirePermissions('invoices:read')
  async pdfFile(@Param('id', id) iid: string, @Res() reply: FastifyReply) {
    const fileId = await this.pdf.fileFor(iid);
    const { file, stream } = await this.files.openForDownload(fileId);
    return reply.header('content-type', 'application/pdf').header('content-length', file.sizeBytes.toString())
      .header('content-disposition', `inline; filename="${file.originalName}"`).header('cache-control', 'private, no-store').send(stream);
  }

  @Get() @RequirePermissions('invoices:read')
  list(@Query(new ZodPipe(invQuery)) q: z.infer<typeof invQuery>) { return this.q.invoices(q); }

  @Get(':id') @RequirePermissions('invoices:read')
  get(@Param('id', id) iid: string) { return this.q.invoice(iid); }

  @Post() @RequirePermissions('invoices:create', 'invoices:issue')
  async create(@Body(new ZodPipe(oneTimeInvoiceSchema)) b: OneTimeInvoiceInput) {
    const r = await this.invoicing.createOneTime(b);
    await this.payments.autoAllocate(b.clientId);
    return r;
  }

  @Post(':id/credit-note') @RequirePermissions('credit_notes:request')
  async creditNote(@Param('id', id) iid: string, @Body(new ZodPipe(creditNoteRequestSchema)) b: z.infer<typeof creditNoteRequestSchema>, @Auth() a: AuthContext) {
    const inv = await this.db.invoice.findUnique({ where: { id: iid } });
    if (!inv) throw notFound('Invoice');
    const amount = parseMoney(b.amount);
    if (!['OPEN', 'UNCOLLECTIBLE'].includes(inv.status)) throw conflict("Faqat to'lanmagan invoice'ga credit note beriladi");
    if (amount > inv.totalMinor - inv.paidMinor - inv.creditedMinor) throw conflict("Summa invoice qoldig'idan katta");
    return this.db.$transaction((tx) => this.approvals.request(tx, {
      policyKey: 'credit_notes', resourceType: 'invoice', resourceId: iid, payload: { invoiceId: iid, amountMinor: amount.toString(), reason: b.reason }, auth: a,
    }));
  }

  @Post(':id/void') @RequirePermissions('invoices:issue')
  async void(@Param('id', id) iid: string, @Body(new ZodPipe(voidRequestSchema)) b: z.infer<typeof voidRequestSchema>, @Auth() a: AuthContext) {
    const inv = await this.db.invoice.findUnique({ where: { id: iid } });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'VOID' || inv.status === 'DRAFT') throw conflict('Invoice bekor qilinadigan holatda emas');
    if (inv.paidMinor > 0n || inv.creditedMinor > 0n) throw conflict("Invoice'ga to'lov yoki credit note qo'llangan — avval taqsimotni bekor qiling");
    return this.db.$transaction((tx) => this.approvals.request(tx, {
      policyKey: 'invoices.void', resourceType: 'invoice', resourceId: iid, payload: { invoiceId: iid, reason: b.reason }, auth: a,
    }));
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly q: BillingQueries) {}

  @Get() @RequirePermissions('payments:read')
  list(@Query(new ZodPipe(payQuery)) q: z.infer<typeof payQuery>) { return this.q.payments(q); }

  @Get(':id') @RequirePermissions('payments:read')
  get(@Param('id', id) pid: string) { return this.q.payment(pid); }

  @Post() @RequirePermissions('payments:record')
  record(@Body(new ZodPipe(paymentRecordSchema)) b: PaymentRecordInput, @Auth() a: AuthContext) { return this.payments.record(b, a); }

  @Post(':id/approve') @RequirePermissions('payments:approve')
  approve(@Param('id', id) pid: string, @Auth() a: AuthContext) { return this.payments.approve(pid, a); }

  @Post(':id/reject') @RequirePermissions('payments:approve')
  reject(@Param('id', id) pid: string, @Body(new ZodPipe(paymentRejectSchema)) b: { reason: string }) { return this.payments.reject(pid, b.reason); }

  @Post(':id/allocate') @RequirePermissions('payments:allocate')
  allocate(@Param('id', id) pid: string, @Body(new ZodPipe(allocateSchema)) b: AllocateInput, @Auth() a: AuthContext) { return this.payments.allocate(pid, b, a); }

  @Post('clients/:clientId/auto-allocate') @RequirePermissions('payments:allocate')
  autoAllocate(@Param('clientId', id) cid: string) { return this.payments.autoAllocate(cid); }

  @Post('allocations/:allocationId/reverse') @RequirePermissions('payments:allocate')
  reverse(@Param('allocationId', id) aid: string, @Auth() a: AuthContext) { return this.payments.reverseAllocation(aid, a); }

  @Post(':id/refunds') @RequirePermissions('refunds:request')
  refund(@Param('id', id) pid: string, @Body(new ZodPipe(refundRequestSchema)) b: z.infer<typeof refundRequestSchema>, @Auth() a: AuthContext) {
    return this.payments.requestRefund(pid, b.amount, b.reason, a);
  }

  @Post('refunds/:refundId/decide') @RequirePermissions('refunds:approve')
  decideRefund(@Param('refundId', id) rid: string, @Body(new ZodPipe(decideSchema)) b: z.infer<typeof decideSchema>, @Auth() a: AuthContext) {
    return this.payments.decideRefund(rid, b.approve, b.reason, a);
  }

  @Post('refunds/:refundId/complete') @RequirePermissions('payments:record')
  completeRefund(@Param('refundId', id) rid: string, @Body(new ZodPipe(completeSchema)) b: { succeeded: boolean }, @Auth() a: AuthContext) {
    return this.payments.completeRefund(rid, b.succeeded, a);
  }
}

@Controller('billing')
export class BillingController {
  constructor(private readonly runs: BillingRunService, private readonly dunning: DunningService, private readonly q: BillingQueries) {}

  @Get('runs') @RequirePermissions('invoices:read')
  list() { return this.runs.runs(); }

  @Post('run') @RequirePermissions('invoices:issue')
  run(@Body(new ZodPipe(z.object({ date: dateString.optional() }))) b: { date?: string }) { return this.runs.run(b.date); }

  @Post('dunning') @RequirePermissions('invoices:issue')
  runDunning(@Body(new ZodPipe(z.object({ date: dateString.optional() }))) b: { date?: string }) { return this.dunning.run(b.date); }

  @Get('clients/:clientId/balance') @RequirePermissions('invoices:read')
  balance(@Param('clientId', id) cid: string) { return this.q.clientBalance(cid); }

  @Post('periods/:month/revalue') @RequirePermissions('finance:close_period')
  revalue(@Param('month', new ZodPipe(monthParam)) m: string, @Auth() a: AuthContext) { return this.runs.revalue(m.length === 7 ? `${m}-01` : m, a); }

  @Post('periods/:month/close') @RequirePermissions('finance:close_period')
  close(@Param('month', new ZodPipe(monthParam)) m: string, @Auth() a: AuthContext) { return this.runs.close(m.length === 7 ? `${m}-01` : m, a); }
}

/** Tasdiqlash siyosatlari uchun bajaruvchilar (credit note, invoice void). */
@Injectable()
export class BillingApprovalHandlers implements OnModuleInit {
  constructor(private readonly db: Db, private readonly approvals: ApprovalsService, private readonly invoicing: InvoicingService) {}

  onModuleInit() {
    const describeInvoice = async (invoiceId: string) =>
      this.db.invoice.findUnique({ where: { id: invoiceId }, include: { client: { select: { displayName: true } } } });
    this.approvals.register('credit_notes', {
      describe: async (p) => {
        const inv = await describeInvoice(String(p.invoiceId));
        return { title: `Credit note: ${inv?.number ?? ''}`, description: `${inv?.client.displayName ?? ''} · ${String(p.reason)}`, amountMinor: String(p.amountMinor), currency: inv?.currency };
      },
      execute: async (tx, r, approverId) => {
        const p = r.payload as { invoiceId: string; amountMinor: string; reason: string };
        await this.invoicing.executeCreditNote(tx, { invoiceId: p.invoiceId, amountMinor: BigInt(p.amountMinor), reason: p.reason, requestedById: r.requestedById, approverId });
      },
    });
    this.approvals.register('invoices.void', {
      describe: async (p) => {
        const inv = await describeInvoice(String(p.invoiceId));
        return { title: `Invoice void: ${inv?.number ?? ''}`, description: `${inv?.client.displayName ?? ''} · ${String(p.reason)}`, amountMinor: inv?.totalMinor.toString(), currency: inv?.currency };
      },
      execute: async (tx, r) => {
        const p = r.payload as { invoiceId: string; reason: string };
        await this.invoicing.executeVoid(tx, p.invoiceId, p.reason, r.id);
      },
    });
  }
}

const services = [LifecycleService, InvoicingService, PaymentsService, DunningService, SubscriptionsService, PlansService, BillingRunService, BillingQueries, InvoicePdfService];

@Module({
  imports: [FinanceModule, ApprovalsModule, FilesModule],
  controllers: [PlansController, SubscriptionsController, InvoicesController, PaymentsController, BillingController],
  providers: [...services, BillingApprovalHandlers],
  exports: services,
})
export class BillingModule {}
