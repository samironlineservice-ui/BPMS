import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  cardSaveTokenSchema, cardUpdateSchema, cardVerifySchema, checkoutCreateSchema, type CheckoutCreateInput, type CheckoutQuote, checkoutQuoteSchema,
  clickCardRequestSchema, emulatorPaySchema, type EmulatorPayInput, emulatorTopupSchema, type EmulatorTopupInput, invoicePaySchema, type InvoicePayInput,
  type PayMethodsDto,
} from '@ads/contracts';
import { Public } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { CardsService } from '../gateways/cards.service.js';
import { CheckoutService } from '../gateways/checkout.service.js';
import { EmulatorService, TEST_SMS_CODE } from '../gateways/emulator.js';
import { PaymentOrdersService } from '../gateways/orders.service.js';
import { PayService } from '../gateways/pay.service.js';
import { FINANCE_ROLES, PAY_ROLES, Portal, type PortalContext, PortalGuard, PortalRoles } from './portal-auth.js';

const id = new ParseUUIDPipe();
const owner = (p: PortalContext) => ({ clientId: p.clientId, portalUserId: p.portalUserId });

/**
 * Kabinet: xizmatlar katalogi, obuna sotib olish, invoice'ni onlayn to'lash, kartalar.
 * clientId FAQAT sessiyadan; pul bilan bog'liq amallar — faqat OWNER/ACCOUNTANT (PAY_ROLES).
 */
@Public()
@UseGuards(PortalGuard)
@Controller('portal')
export class PortalPayController {
  constructor(
    private readonly checkout: CheckoutService, private readonly pay: PayService, private readonly cards: CardsService,
    private readonly orders: PaymentOrdersService, private readonly emu: EmulatorService,
  ) {}

  @Get('catalog') @PortalRoles(...FINANCE_ROLES)
  catalog(@Portal() p: PortalContext) { return this.checkout.catalog(p.clientId); }

  @Post('checkout/quote') @HttpCode(200) @PortalRoles(...FINANCE_ROLES)
  async quote(@Body(new ZodPipe(checkoutQuoteSchema)) b: { items: { planPriceId: string; quantity: number }[] }): Promise<CheckoutQuote> {
    const { projectId: _p, specs: _s, ...q } = await this.checkout.quote(b.items);
    return q;
  }

  @Post('checkout') @PortalRoles(...PAY_ROLES)
  create(@Portal() p: PortalContext, @Body(new ZodPipe(checkoutCreateSchema)) b: CheckoutCreateInput) { return this.checkout.create(owner(p), b); }

  @Get('pay/methods') @PortalRoles(...FINANCE_ROLES)
  async methods(@Portal() p: PortalContext): Promise<PayMethodsDto> {
    const m = await this.pay.methods(p.clientId);
    return (await this.emu.anyEnabled()) ? { ...m, testCards: this.emu.testCards(), testSmsCode: TEST_SMS_CODE } : m;
  }

  @Post('invoices/pay') @PortalRoles(...PAY_ROLES)
  payInvoices(@Portal() p: PortalContext, @Body(new ZodPipe(invoicePaySchema)) b: InvoicePayInput) { return this.pay.payInvoices(owner(p), b); }

  @Get('pay/orders/:id') @PortalRoles(...FINANCE_ROLES)
  order(@Portal() p: PortalContext, @Param('id', id) oid: string) { return this.orders.status(oid, p.clientId); }

  // ── Saqlangan kartalar ──
  @Get('cards') @PortalRoles(...FINANCE_ROLES)
  listCards(@Portal() p: PortalContext) { return this.cards.list(p.clientId); }

  @Post('cards/payme') @PortalRoles(...PAY_ROLES)
  savePayme(@Portal() p: PortalContext, @Body(new ZodPipe(cardSaveTokenSchema)) b: { token: string }) { return this.cards.savePayme(owner(p), b.token); }

  @Post('cards/click') @PortalRoles(...PAY_ROLES)
  clickRequest(@Portal() p: PortalContext, @Body(new ZodPipe(clickCardRequestSchema)) b: { cardNumber: string; expire: string }) {
    return this.cards.clickRequest(owner(p), b.cardNumber, b.expire);
  }

  @Post('cards/:id/verify') @HttpCode(200) @PortalRoles(...PAY_ROLES)
  verify(@Portal() p: PortalContext, @Param('id', id) cid: string, @Body(new ZodPipe(cardVerifySchema)) b: { smsCode: string }) {
    return this.cards.clickVerify(owner(p), cid, b.smsCode);
  }

  @Post('cards/:id/settings') @HttpCode(200) @PortalRoles(...PAY_ROLES)
  updateCard(@Portal() p: PortalContext, @Param('id', id) cid: string, @Body(new ZodPipe(cardUpdateSchema)) b: { isDefault?: boolean; autopay?: boolean }) {
    return this.cards.update(owner(p), cid, b);
  }

  @Post('cards/:id/remove') @HttpCode(200) @PortalRoles(...PAY_ROLES)
  removeCard(@Portal() p: PortalContext, @Param('id', id) cid: string) { return this.cards.remove(owner(p), cid); }

  // ── Emulyator (faqat lokal muhit; production'da 404) ──
  @Post('pay/emulator/topup') @HttpCode(200) @PortalRoles(...PAY_ROLES)
  emulatorTopup(@Portal() p: PortalContext, @Body(new ZodPipe(emulatorTopupSchema)) b: EmulatorTopupInput) { return this.emu.topup(p.clientId, b); }

  @Post('pay/emulator/:id') @HttpCode(200) @PortalRoles(...PAY_ROLES)
  emulatorPay(@Portal() p: PortalContext, @Param('id', id) oid: string, @Body(new ZodPipe(emulatorPaySchema)) b: EmulatorPayInput) {
    return this.emu.payOrder(p.clientId, oid, b);
  }
}
