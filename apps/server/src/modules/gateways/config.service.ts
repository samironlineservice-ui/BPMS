import { Injectable } from '@nestjs/common';
import { GATEWAY_LABELS, type GatewayConfigDto, type GatewayConfigInput } from '@ads/contracts';
import { env, isProd } from '../../config/env.js';
import { AuditService } from '../../platform/audit.service.js';
import { decrypt, encrypt, KEY_VERSION } from '../../platform/crypto.js';
import { Db } from '../../platform/db.service.js';
import { badRequest } from '../../platform/errors.js';
import type { ProviderKey } from './common.js';
import { PROVIDERS } from './common.js';

type Mode = 'EMULATOR' | 'TEST' | 'PROD';
export interface ActiveConfig {
  provider: ProviderKey; enabled: boolean; mode: Mode; merchantId: string;
  settings: Record<string, string>; secrets: Record<string, string>;
  /** Bo'sh bo'lmasa — webhook faqat shu IP'lardan qabul qilinadi (emulyatorda tekshirilmaydi) */
  allowedIps: string[];
}

const FIELDS: Record<ProviderKey, { settings: [string, string][]; secrets: [string, string][] }> = {
  PAYME: {
    settings: [['accountField', "Hisob maydoni (ac.*), standart: order_id"], ['ikpu', 'MXIK (IKPU) kodi — fiskal chek uchun'], ['packageCode', "O'lchov birligi (package_code)"]],
    secrets: [['key', 'Kassa kaliti (KEY)'], ['testKey', 'Test kaliti (TEST_KEY)']],
  },
  CLICK: { settings: [['serviceId', 'Service ID'], ['merchantUserId', 'Merchant user ID']], secrets: [['secretKey', 'Secret key']] },
  UZUM: { settings: [['serviceId', 'Service ID']], secrets: [['login', 'Webhook login'], ['password', 'Webhook paroli']] },
  PAYNET: { settings: [['serviceId', 'Service ID']], secrets: [['login', 'UWS login'], ['password', 'UWS paroli']] },
};

/** Emulyator rejimidagi standart qiymatlar — faqat lokal sinov uchun (production'da emulyator o'chiq). */
const EMULATOR: Record<ProviderKey, { merchantId: string; settings: Record<string, string>; secrets: Record<string, string> }> = {
  PAYME: { merchantId: 'emulator-merchant', settings: { accountField: 'order_id' }, secrets: { key: 'emulator-payme-key', testKey: 'emulator-payme-key' } },
  CLICK: { merchantId: '9999', settings: { serviceId: '99999', merchantUserId: '99999' }, secrets: { secretKey: 'emulator-click-secret' } },
  UZUM: { merchantId: '', settings: { serviceId: '100500' }, secrets: { login: 'uzum', password: 'emulator-uzum' } },
  PAYNET: { merchantId: '', settings: { serviceId: '777' }, secrets: { login: 'paynet', password: 'emulator-paynet' } },
};

const CALLBACKS: Record<ProviderKey, string[]> = {
  PAYME: ['/gateways/payme'],
  CLICK: ['/gateways/click/prepare', '/gateways/click/complete'],
  UZUM: ['/gateways/uzum/check', '/gateways/uzum/create', '/gateways/uzum/confirm', '/gateways/uzum/reverse', '/gateways/uzum/status'],
  PAYNET: ['/gateways/paynet'],
};

@Injectable()
export class GatewayConfigService {
  constructor(private readonly db: Db, private readonly audit: AuditService) {}

  /** Amaldagi sozlama. Yozuv bo'lmasa: dev'da emulyator rejimida yoqilgan, production'da o'chiq. */
  async get(provider: ProviderKey): Promise<ActiveConfig> {
    const row = await this.db.paymentProviderConfig.findUnique({ where: { provider } });
    const mode = (row?.mode ?? 'EMULATOR') as Mode;
    let secrets: Record<string, string> = {};
    if (row?.secretEnc?.length) { try { secrets = JSON.parse(decrypt(row.secretEnc)) as Record<string, string>; } catch { secrets = {}; } }
    const settings = (row?.settings ?? {}) as Record<string, string>;
    const base: ActiveConfig = { provider, enabled: row ? row.enabled : !isProd, mode, merchantId: row?.merchantId ?? '', settings, secrets, allowedIps: row?.allowedIps ?? [] };
    if (mode === 'EMULATOR') {
      if (isProd) return { ...base, enabled: false }; // emulyator production'da HECH QACHON ishlamaydi
      const e = EMULATOR[provider];
      return { ...base, merchantId: base.merchantId || e.merchantId, settings: { ...e.settings, ...strip(settings) }, secrets: { ...e.secrets, ...strip(secrets) } };
    }
    return base;
  }

  async active(provider: ProviderKey) {
    const c = await this.get(provider);
    if (!c.enabled) throw badRequest(`${GATEWAY_LABELS[provider]} hozircha ulanmagan`);
    return c;
  }

  async enabledList() {
    const all = await Promise.all(PROVIDERS.map((p) => this.get(p)));
    return all.filter((c) => c.enabled);
  }

  async list(): Promise<GatewayConfigDto[]> {
    const rows = await this.db.paymentProviderConfig.findMany();
    return Promise.all(PROVIDERS.map(async (p) => {
      const row = rows.find((r) => r.provider === p);
      const c = await this.get(p);
      let stored: Record<string, string> = {};
      if (row?.secretEnc?.length) { try { stored = JSON.parse(decrypt(row.secretEnc)) as Record<string, string>; } catch { stored = {}; } }
      return {
        provider: p, label: GATEWAY_LABELS[p]!, enabled: c.enabled, mode: c.mode, merchantId: row?.merchantId ?? '',
        settings: (row?.settings ?? {}) as Record<string, string>, secretKeys: Object.keys(strip(stored)),
        callbackUrls: CALLBACKS[p].map((x) => `${env.PUBLIC_API_URL}/api/v1${x}`), updatedAt: row?.updatedAt.toISOString() ?? null,
        fields: { settings: FIELDS[p].settings.map(([key, label]) => ({ key, label })), secrets: FIELDS[p].secrets.map(([key, label]) => ({ key, label })) },
      };
    }));
  }

  async update(provider: ProviderKey, input: GatewayConfigInput) {
    if (isProd && input.mode === 'EMULATOR' && input.enabled) throw badRequest("Production'da emulyator rejimi taqiqlangan");
    const row = await this.db.paymentProviderConfig.findUnique({ where: { provider } });
    let stored: Record<string, string> = {};
    if (row?.secretEnc?.length) { try { stored = JSON.parse(decrypt(row.secretEnc)) as Record<string, string>; } catch { stored = {}; } }
    const allowedS = new Set(FIELDS[provider].settings.map(([k]) => k));
    const allowedK = new Set(FIELDS[provider].secrets.map(([k]) => k));
    const settings = Object.fromEntries(Object.entries(input.settings).filter(([k]) => allowedS.has(k)).map(([k, v]) => [k, v.trim()]));
    const secrets = { ...stored, ...Object.fromEntries(Object.entries(input.secrets).filter(([k, v]) => allowedK.has(k) && v.trim()).map(([k, v]) => [k, v.trim()])) };
    if (input.enabled && input.mode !== 'EMULATOR') {
      // Payme: test rejimida TEST_KEY, haqiqiyda KEY; boshqalar — barcha kalitlar
      const need = provider === 'PAYME' ? [input.mode === 'PROD' ? 'key' : 'testKey'] : FIELDS[provider].secrets.map(([k]) => k);
      const missing = FIELDS[provider].secrets.filter(([k]) => need.includes(k) && !secrets[k]).map(([, l]) => l);
      if ((provider === 'PAYME' || provider === 'CLICK') && !input.merchantId.trim()) missing.unshift('Merchant ID');
      for (const [k, l] of FIELDS[provider].settings) if (k === 'serviceId' && !settings[k]) missing.push(l);
      if (missing.length) throw badRequest(`To'ldirilmagan: ${missing.join(', ')}`);
    }
    const data = {
      enabled: input.enabled, mode: input.mode, merchantId: input.merchantId.trim(), settings, testMode: input.mode !== 'PROD',
      secretEnc: encrypt(JSON.stringify(secrets)), keyVersion: KEY_VERSION, allowedIps: row?.allowedIps ?? [],
    };
    await this.db.$transaction(async (tx) => {
      await tx.paymentProviderConfig.upsert({ where: { provider }, create: { provider, ...data }, update: { ...data, rowVersion: { increment: 1 } } });
      // Maxfiy qiymatlar audit'ga yozilmaydi — faqat qaysi kalitlar o'zgargani
      await this.audit.record(tx, {
        action: 'gateway.config_updated', resourceType: 'gateway', resourceId: null,
        metadata: { provider, enabled: input.enabled, mode: input.mode, secretsChanged: Object.keys(input.secrets).filter((k) => input.secrets[k]?.trim()) },
      });
    });
    return { ok: true };
  }
}

const strip = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string' && v.trim()));
