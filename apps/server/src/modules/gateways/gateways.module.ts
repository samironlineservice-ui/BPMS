import { Body, Controller, Delete, Get, Headers, HttpCode, Injectable, Logger, Module, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { gatewayConfigSchema, type GatewayConfigInput, gatewayProviderEnum } from '@ads/contracts';
import { Public, RequirePermissions, SkipCsrf } from '../../platform/auth/decorators.js';
import { requestContext } from '../../platform/context.js';
import { Db } from '../../platform/db.service.js';
import { dayStart, dbDate, todayLocal } from '../../platform/time.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { BillingModule } from '../billing/billing.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { CaptureService } from './capture.service.js';
import { CardsService } from './cards.service.js';
import { CheckoutService } from './checkout.service.js';
import type { ProviderKey } from './common.js';
import { GatewayConfigService } from './config.service.js';
import { EmulatorService } from './emulator.js';
import { PaymentOrdersService } from './orders.service.js';
import { PayService } from './pay.service.js';
import { ClickService } from './providers/click.js';
import { PaymeService } from './providers/payme.js';
import { PaynetService } from './providers/paynet.js';
import { UzumService } from './providers/uzum.js';

type Raw = FastifyRequest & { rawBody?: string };
type Out = { authOk: boolean; httpStatus?: number; response: unknown };

/** To'lov tizimlari serverlari chaqiradigan endpoint'lar (sessiyasiz; himoya — provayder auth/imzo + ixtiyoriy IP ro'yxati). */
@Public()
@SkipCsrf()
@Controller('gateways')
export class GatewayWebhooksController {
  private readonly log = new Logger('Gateways');
  constructor(
    private readonly config: GatewayConfigService, private readonly capture: CaptureService,
    private readonly payme: PaymeService, private readonly click: ClickService, private readonly uzum: UzumService, private readonly paynet: PaynetService,
  ) {}

  /** Umumiy o'ram: IP tekshiruvi, kutilmagan xatoda protokol formatidagi javob, har so'rovni jurnalga yozish. */
  private async run(provider: ProviderKey, method: string, externalId: unknown, req: Raw, reply: FastifyReply, fn: () => Promise<Out>, onError: () => Out) {
    const t = Date.now();
    requestContext.setActor({ type: 'SYSTEM', id: null, label: `gateway:${provider.toLowerCase()}` });
    const c = await this.config.get(provider);
    let out: Out;
    if (c.mode !== 'EMULATOR' && c.allowedIps.length && !c.allowedIps.includes(req.ip)) out = { authOk: false, httpStatus: 403, response: { error: 'Forbidden' } };
    else {
      try { out = await fn(); } catch (e) { this.log.error(`${provider} ${method}: ${(e as Error).message}`); out = onError(); }
    }
    const status = out.httpStatus ?? 200;
    reply.status(status);
    await this.capture.logEvent({
      provider, method, externalId: externalId == null ? null : String(externalId), rawBody: req.rawBody ?? '', request: req.body, response: out.response,
      httpStatus: status, authOk: out.authOk, ip: req.ip ?? null, ms: Date.now() - t,
    });
    return out.response;
  }

  @Post('payme')
  paymeHook(@Req() req: Raw, @Res({ passthrough: true }) reply: FastifyReply, @Body() b: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
    return this.run('PAYME', String(b?.method ?? '?'), b?.params?.id, req, reply, () => this.payme.handle(b, req.headers.authorization),
      () => ({ authOk: false, response: { jsonrpc: '2.0', id: b?.id ?? null, error: { code: -32400, message: { ru: 'Системная ошибка', uz: 'Tizim xatosi', en: 'System error' } } } }));
  }

  @Post('click/prepare')
  clickPrepare(@Req() req: Raw, @Res({ passthrough: true }) reply: FastifyReply, @Body() b: Record<string, string>) {
    return this.run('CLICK', 'prepare', b?.click_trans_id, req, reply, () => this.click.prepare(b), () => ({ authOk: false, response: { error: -7, error_note: 'Failed to update user' } }));
  }

  @Post('click/complete')
  clickComplete(@Req() req: Raw, @Res({ passthrough: true }) reply: FastifyReply, @Body() b: Record<string, string>) {
    return this.run('CLICK', 'complete', b?.click_trans_id, req, reply, () => this.click.complete(b), () => ({ authOk: false, response: { error: -7, error_note: 'Failed to update user' } }));
  }

  @Post('uzum/:action')
  uzumHook(@Req() req: Raw, @Res({ passthrough: true }) reply: FastifyReply, @Param('action') action: string, @Body() b: Record<string, unknown>) {
    return this.run('UZUM', action.slice(0, 20), b?.transId, req, reply, () => this.uzum.handle(action, b, req.headers.authorization),
      () => ({ authOk: false, httpStatus: 400, response: { serviceId: b?.serviceId ?? null, timestamp: Date.now(), status: 'FAILED', errorCode: '99999' } }));
  }

  @Post('paynet')
  paynetHook(@Req() req: Raw, @Res({ passthrough: true }) reply: FastifyReply, @Body() b: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
    return this.run('PAYNET', String(b?.method ?? '?'), b?.params?.transactionId, req, reply, () => this.paynet.handle(b, req.headers.authorization),
      () => ({ authOk: false, response: { jsonrpc: '2.0', id: b?.id ?? null, error: { code: 102, message: 'Tizim xatosi' } } }));
  }
}

/** Emulyator: Payme Subscribe API va Click Merchant API o'rnini bosadi (faqat lokal muhit; production'da 404). */
@Public()
@SkipCsrf()
@Controller('gateways/emulator')
export class GatewayEmulatorController {
  constructor(private readonly emu: EmulatorService) {}

  @Post('payme-api') @HttpCode(200)
  paymeApi(@Body() b: { id?: unknown; method?: string; params?: Record<string, unknown> }, @Headers('x-auth') xAuth?: string) { return this.emu.paymeApi(b, xAuth); }

  @Post('click-api/card_token/:op')
  async clickPost(@Param('op') op: string, @Body() b: Record<string, unknown>, @Headers('auth') auth: string | undefined, @Res({ passthrough: true }) reply: FastifyReply) {
    const r = await this.emu.clickApi('POST', `/card_token/${op}`, b ?? {}, auth);
    reply.status(r.status);
    return r.body;
  }

  @Delete('click-api/card_token/:sid/:token')
  async clickDelete(@Param('sid') sid: string, @Param('token') token: string, @Headers('auth') auth: string | undefined, @Res({ passthrough: true }) reply: FastifyReply) {
    const r = await this.emu.clickApi('DELETE', `/card_token/${sid}/${token}`, {}, auth);
    reply.status(r.status);
    return r.body;
  }
}

/** Xodimlar: Sozlamalar → To'lov tizimlari. Maxfiy kalitlar hech qachon qaytarilmaydi (faqat qaysilari kiritilgani). */
@Controller('gateways')
export class GatewaySettingsController {
  constructor(private readonly config: GatewayConfigService) {}

  @Get('config') @RequirePermissions('gateways:read') list() { return this.config.list(); }

  @Put('config/:provider') @RequirePermissions('gateways:configure')
  update(@Param('provider', new ZodPipe(gatewayProviderEnum)) provider: ProviderKey, @Body(new ZodPipe(gatewayConfigSchema)) b: GatewayConfigInput) {
    return this.config.update(provider, b);
  }
}

/** Worker ishlari: muddati o'tganlarni yopish, checkout'ni qayta bajarish, avtomatik to'lov. */
@Injectable()
export class GatewayJobsService {
  private readonly log = new Logger('GatewayJobs');
  constructor(private readonly db: Db, private readonly capture: CaptureService, private readonly checkout: CheckoutService, private readonly pay: PayService) {}

  async expire() {
    const now = Date.now();
    const stale = await this.db.gatewayTransaction.findMany({
      where: {
        state: 'PENDING',
        OR: [
          { provider: 'PAYME', providerTime: { lt: new Date(now - 43_200_000) } }, // Payme: 12 soat
          { provider: 'UZUM', createdAt: { lt: new Date(now - 30 * 60_000) } }, // Uzum: 30 daqiqa
          { provider: 'CLICK', createdAt: { lt: new Date(now - 60 * 60_000) } },
        ],
      },
      select: { id: true },
    });
    for (const g of stale) await this.capture.cancel(g.id, 4);
    const expired = await this.db.paymentOrder.findMany({
      where: { kind: 'FIXED', status: 'PENDING', expiresAt: { lt: new Date() }, transactions: { none: { state: 'PENDING' } } }, select: { id: true },
    });
    const ids = expired.map((o) => o.id);
    await this.db.paymentOrder.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    await this.db.checkoutOrder.updateMany({ where: { paymentOrderId: { in: ids }, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    const cards = await this.db.paymentCard.updateMany({ where: { status: 'PENDING', createdAt: { lt: new Date(now - 86_400_000) } }, data: { status: 'REMOVED', removedAt: new Date() } });
    return { cancelledTx: stale.length, expiredOrders: ids.length, staleCards: cards.count };
  }

  async retryFulfillment() {
    const rows = await this.db.checkoutOrder.findMany({ where: { status: 'PAID', paidAt: { lt: new Date(Date.now() - 60_000) } }, select: { id: true }, take: 50 });
    for (const r of rows) await this.checkout.fulfill(r.id);
    return { retried: rows.length };
  }

  /** Avtomatik to'lov: mijoz yoqib qo'ygan karta bilan ochiq invoice'lar. Kuniga bitta urinish, invoice bo'yicha jami 3 ta muvaffaqiyatsiz urinishgacha. */
  async autopay() {
    const today = todayLocal();
    const since = dayStart(today);
    const cards = await this.db.paymentCard.findMany({ where: { autopay: true, status: 'ACTIVE' }, select: { id: true, clientId: true } });
    let charged = 0; let failed = 0;
    for (const card of cards) {
      const invoices = await this.db.invoice.findMany({ where: { clientId: card.clientId, status: 'OPEN', issueDate: { lte: dbDate(today) } }, select: { id: true }, orderBy: { dueDate: 'asc' }, take: 20 });
      const ids: string[] = [];
      for (const inv of invoices) {
        const tries = await this.db.paymentOrderTarget.findMany({ where: { invoiceId: inv.id, order: { purpose: 'AUTOPAY' } }, select: { order: { select: { createdAt: true, status: true } } } });
        if (tries.some((t) => t.order.createdAt >= since || t.order.status === 'PENDING')) continue;
        if (tries.filter((t) => t.order.status === 'FAILED').length >= 3) continue;
        ids.push(inv.id);
      }
      if (!ids.length) continue;
      try {
        await this.pay.payInvoices({ clientId: card.clientId, portalUserId: null }, { invoiceIds: ids, method: 'CARD', cardId: card.id }, 'AUTOPAY');
        charged++;
      } catch (e) {
        failed++;
        this.log.warn(`autopay ${card.clientId}: ${(e as Error).message}`);
      }
    }
    return { cards: cards.length, charged, failed };
  }
}

const services = [
  GatewayConfigService, PaymentOrdersService, CaptureService, PaymeService, ClickService, UzumService, PaynetService,
  CardsService, PayService, CheckoutService, EmulatorService, GatewayJobsService,
];

@Module({
  imports: [FinanceModule, BillingModule],
  controllers: [GatewayWebhooksController, GatewayEmulatorController, GatewaySettingsController],
  providers: services,
  exports: services,
})
export class GatewaysModule {}
