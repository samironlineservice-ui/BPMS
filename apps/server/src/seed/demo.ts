// Demo ma'lumotlar: HAQIQIY servislar orqali (ledger, MRR, dunning, DB qoidalari — hammasi ishlaydi).
// Tarix "bugun"ni avgustdan hozirgacha kunma-kun aylantirib hosil qilinadi (setTodayOverride — faqat seed uchun).
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  clientUpsertSchema, componentUpsertSchema, contactUpsertSchema, convertMinor, deploymentCreateSchema, deviceCreateSchema, installationCreateSchema,
  minorToDecimalString, PERMISSION_KEYS, planCreateSchema, planPriceCreateSchema, planUpdateSchema, projectCreateSchema, releaseCreateSchema, siteUpsertSchema,
  subscriptionCreateSchema, SYSTEM_ROLES,
} from '@ads/contracts';
import type { AuthContext } from '../platform/auth/auth.types.js';
import { requestContext } from '../platform/context.js';
import { Db } from '../platform/db.service.js';
import { WorkerPlatformModule } from '../platform/platform.module.js';
import { addDays, dayStart, dbDate, fromDbDate, setTodayOverride, todayLocal } from '../platform/time.js';
import { ApprovalsModule } from '../modules/approvals/approvals.module.js';
import { BillingModule } from '../modules/billing/billing.module.js';
import { BillingRunService } from '../modules/billing/billing-run.service.js';
import { DunningService } from '../modules/billing/dunning.service.js';
import { PaymentsService } from '../modules/billing/payments.service.js';
import { PlansService } from '../modules/billing/plans.service.js';
import { SubscriptionsService } from '../modules/billing/subscriptions.service.js';
import { ClientsModule } from '../modules/clients/clients.module.js';
import { ClientsService } from '../modules/clients/clients.service.js';
import { DeploymentsService } from '../modules/devices/deployments.service.js';
import { DevicesModule } from '../modules/devices/devices.module.js';
import { DevicesService } from '../modules/devices/devices.service.js';
import { ReleasesService } from '../modules/devices/releases.service.js';
import { FilesModule } from '../modules/files/files.module.js';
import { FinanceModule } from '../modules/finance/finance.module.js';
import { FxService } from '../modules/finance/fx.service.js';
import { ProjectsModule } from '../modules/projects/projects.module.js';
import { ProjectsService } from '../modules/projects/projects.service.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { RequestsModule, RequestsService } from '../modules/requests/requests.module.js';

@Module({ imports: [WorkerPlatformModule, FinanceModule, ApprovalsModule, FilesModule, BillingModule, ClientsModule, ProjectsModule, DevicesModule, RequestsModule] })
class DemoModule {}

const START = '2026-08-01';
const log = (s: string) => console.log(`demo: ${s}`);

export async function seedDemo() {
  const app = await NestFactory.createApplicationContext(DemoModule, { logger: ['error', 'warn'] });
  const db = app.get(Db);
  const s = {
    clients: app.get(ClientsService), projects: app.get(ProjectsService), plans: app.get(PlansService), subs: app.get(SubscriptionsService),
    pays: app.get(PaymentsService), runs: app.get(BillingRunService), dunning: app.get(DunningService), fx: app.get(FxService),
    devices: app.get(DevicesService), releases: app.get(ReleasesService), deployments: app.get(DeploymentsService),
  };
  if (await db.client.count()) {
    log("mijozlar allaqachon bor — asosiy demo o'tkazib yuborildi (to'liq qayta: npm run db:reset)");
    await seedPortalDemo(db, app.get(RequestsService));
    await seedCatalogDemo(db, s.plans);
    await app.close();
    return;
  }

  const director = await db.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { key: 'director' } } } } });
  const authOf = (u: { id: string; email: string; fullName: string }, perms: readonly string[]): AuthContext =>
    ({ userId: u.id, sessionId: '00000000-0000-0000-0000-000000000000', email: u.email, fullName: u.fullName, mfaVerified: true, permissions: new Set(perms) });
  const boss = authOf(director, PERMISSION_KEYS);
  const asUser = <T>(a: AuthContext, fn: () => Promise<T>) =>
    requestContext.run({ requestId: 'seed-demo', ip: null, userAgent: 'seed', actor: { type: 'STAFF', id: a.userId, label: a.email } }, fn);

  // ── Kompaniya, demo xodimlar ──
  await db.setting.upsert({
    where: { key: 'company.profile' }, update: {},
    create: { key: 'company.profile', value: { name: 'ADS', legalName: '"ADS" MChJ (demo rekvizitlar)', tagline: 'AI, avtomatlashtirish va hisobot tizimlari', address: "Toshkent sh., Mirzo Ulug'bek tumani", phone: '+998 71 200 00 00', email: 'info@ads.local' } },
  });
  const mkStaff = async (email: string, fullName: string, roleKey: string) => {
    const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await db.user.create({ data: { email, fullName, status: 'INVITED', roleAssignments: { create: { roleId: role.id, grantedById: director.id } } } });
    return authOf(u, SYSTEM_ROLES.find((r) => r.key === roleKey)!.permissions);
  };
  const manager = await mkStaff('menejer.demo@ads.local', 'Aziza Karimova (demo)', 'manager');
  const accountant = await mkStaff('buxgalter.demo@ads.local', 'Sardor Rasulov (demo)', 'accountant');

  // ── Loyihalar, komponentlar, tariflar ──
  setTodayOverride('2026-07-25');
  const proj = async (code: string, name: string, description: string, platforms: string[], comps: [string, string, string, string[]][]) => {
    const p = await asUser(boss, () => s.projects.create(projectCreateSchema.parse({ code, name, description, status: 'ACTIVE', supportedPlatforms: platforms, ownerId: director.id })));
    const ids: Record<string, string> = {};
    for (const [key, cname, runtime, plats] of comps) ids[key] = (await s.projects.addComponent(p.id, componentUpsertSchema.parse({ key, name: cname, runtime, supportedPlatforms: plats }))).id;
    return { id: p.id, comps: ids };
  };
  const savdo = await proj('savdo-tahlil', 'Savdo tahlili', "Do'konlar tarmog'i uchun kunlik savdo, qoldiq va kassa hisobotlari", ['LINUX', 'WINDOWS'], [
    ['report-server', 'Hisobot serveri', 'SERVER_SERVICE', ['LINUX', 'WINDOWS']], ['kassa-connector', 'Kassa integratsiyasi', 'DESKTOP_APP', ['WINDOWS']],
  ]);
  const kamera = await proj('kamera-ai', 'Kamera AI nazorat', "Ishlab chiqarishda kamera orqali sifat va xavfsizlik nazorati (GPU inferens + edge)", ['LINUX', 'ESP_IDF'], [
    ['ai-inference', 'AI inferens', 'CONTAINER_STACK', ['LINUX']], ['edge-collector', "Edge yig'uvchi", 'SERVER_SERVICE', ['LINUX']], ['sensor-fw', 'Datchik firmware', 'FIRMWARE', ['ESP_IDF']],
  ]);
  const ombor = await proj('ombor-avto', 'Ombor avtomatlashtirish', 'Ombor kirim-chiqimi, skanerlar va qoldiq nazorati', ['LINUX', 'WINDOWS'], [
    ['ombor-web', 'Ombor web', 'STATIC_WEB', ['LINUX']], ['scanner-service', 'Skaner servisi', 'SERVER_SERVICE', ['WINDOWS']],
  ]);
  const plan = async (projectId: string, code: string, name: string, prices: [string, string][]) => {
    const p = await asUser(boss, () => s.plans.create(planCreateSchema.parse({ projectId, code, name, intervalMonths: 1 })));
    const ids: Record<string, string> = {};
    for (const [cur, amount] of prices) ids[cur] = (await asUser(boss, () => s.plans.addPrice(p.id, planPriceCreateSchema.parse({ currency: cur, unitAmount: amount, validFrom: '2026-07-01' }), boss))).id;
    return ids;
  };
  const savdoStd = await plan(savdo.id, 'standart', "Standart (1 filial)", [['UZS', '1200000'], ['USD', '99']]);
  const savdoPro = await plan(savdo.id, 'premium', "Premium (1 filial, kengaytirilgan)", [['UZS', '2400000'], ['USD', '199']]);
  const kameraStd = await plan(kamera.id, 'kamera', 'Bitta kamera nazorati', [['UZS', '650000'], ['USD', '55']]);
  const omborPro = await plan(ombor.id, 'ombor', 'Ombor (1 ombor)', [['UZS', '3000000'], ['USD', '250']]);
  log('loyihalar va tariflar');

  // ── Mijozlar ──
  const client = async (c: Record<string, unknown>, contacts: Record<string, unknown>[], sites: string[]) => {
    const r = await asUser(boss, () => s.clients.create(clientUpsertSchema.parse({ type: 'COMPANY', status: 'ACTIVE', accountManagerId: director.id, ...c })));
    for (const x of contacts) await asUser(boss, () => s.clients.addContact(r.id, contactUpsertSchema.parse(x)));
    const siteIds: string[] = [];
    for (const name of sites) siteIds.push((await asUser(boss, () => s.clients.addSite(r.id, siteUpsertSchema.parse({ name, region: 'Toshkent' })))).id);
    return { id: r.id, sites: siteIds };
  };
  const baraka = await client({ legalName: '"Baraka Market" MChJ', displayName: 'Baraka Market', tin: '305112233', bankName: '"Kapitalbank" ATB', bankMfo: '01158', bankAccount: '20208000400112233001', phone: '+998 90 111 22 33', billingEmail: 'buxgalteriya@baraka.local', tags: ['retail', 'tarmoq'] },
    [{ fullName: 'Rustam Aliyev', position: 'Direktor', phone: '+998 90 111 22 33', isPrimary: true }, { fullName: 'Dilnoza Saidova', position: 'Bosh buxgalter', email: 'buxgalteriya@baraka.local', isBilling: true }],
    ['Chilonzor filiali', 'Yunusobod filiali', "Sergeli filiali"]);
  const logistika = await client({ legalName: '"Toshkent Logistika" AJ', displayName: 'Toshkent Logistika', tin: '302445566', billingCurrency: 'USD', phone: '+998 71 233 44 55', tags: ['logistika'] },
    [{ fullName: 'Jahongir Tursunov', position: 'IT bo\'lim boshlig\'i', phone: '+998 93 455 66 77', isPrimary: true }], ['Bosh ombor']);
  const tekstil = await client({ legalName: '"Samarqand Tekstil" MChJ', displayName: 'Samarqand Tekstil', tin: '307778899', billingCurrency: 'USD', phone: '+998 66 233 11 22', tags: ['ishlab chiqarish'] },
    [{ fullName: 'Farrux Ergashev', position: 'Ishlab chiqarish direktori', isPrimary: true }], ['1-sex', '2-sex']);
  const pharm = await client({ legalName: '"Golden Pharm" MChJ', displayName: 'Golden Pharm', tin: '309990011', phone: '+998 99 800 70 60', tags: ['farmatsevtika', 'retail'] },
    [{ fullName: 'Malika Yusupova', position: 'Direktor', isPrimary: true, isBilling: true }], ['Markaziy dorixona']);
  const orient = await client({ legalName: '"Orient Foods" MChJ', displayName: 'Orient Foods', tin: '304321987', phone: '+998 97 321 98 76', tags: ['ishlab chiqarish'] },
    [{ fullName: 'Bekzod Nazarov', position: 'Bosh muhandis', isPrimary: true }], ['Zavod']);
  const navbahor = await client({ legalName: '"Navbahor Savdo" XK', displayName: 'Navbahor Savdo', tin: '308765432', status: 'LEAD', tags: ['retail'] },
    [{ fullName: 'Ulug\'bek Hasanov', position: 'Egasi', phone: '+998 94 765 43 21', isPrimary: true }], []);
  const link = (clientId: string, projectId: string, status = 'ONBOARDING') => asUser(boss, () => s.projects.link({ clientId, projectId, status: status as 'ONBOARDING', startedOn: null, endedOn: null, accountManagerId: null, notes: null }));
  const cp = {
    baraka: (await link(baraka.id, savdo.id)).id, logistika: (await link(logistika.id, ombor.id)).id, tekstil: (await link(tekstil.id, kamera.id)).id,
    pharm: (await link(pharm.id, savdo.id)).id, orient: (await link(orient.id, kamera.id)).id,
  };
  await link(navbahor.id, savdo.id, 'PROSPECT');
  // Kiritilgan sana demo tarixiga mos: asosiy mijozlar iyulda (Navbahor — pastda, shu oy lid sifatida)
  await db.$executeRaw`UPDATE clients SET created_at = ${dayStart('2026-07-20')} WHERE id <> ${navbahor.id}::uuid`;
  log('mijozlar');

  // ── Tarix simulyatsiyasi ──
  const fxDates = new Set<string>();
  const ensureRate = async (d: string) => {
    if (await s.fx.rateOn(d, db, 3)) return;
    try { await s.fx.fetchCbu(d); } catch { /* tarmoq yo'q */ }
    if (!(await s.fx.rateOn(d, db, 3)) && !fxDates.has(d)) { fxDates.add(d); await s.fx.addManual(d, (12000 + (Number(d.slice(8)) % 7) * 11).toFixed(2), director.id); }
  };
  const subPlan: { day: string; key: keyof typeof cp; input: Record<string, unknown> }[] = [
    { day: '2026-08-01', key: 'baraka', input: { currency: 'UZS', items: [{ planPriceId: savdoStd.UZS, quantity: 3 }] } },
    { day: '2026-08-01', key: 'orient', input: { currency: 'UZS', items: [{ planPriceId: kameraStd.UZS, quantity: 2 }] } },
    { day: '2026-08-15', key: 'logistika', input: { currency: 'USD', items: [{ planPriceId: omborPro.USD, quantity: 1, discountBp: 1000 }] } },
    { day: '2026-09-01', key: 'tekstil', input: { currency: 'USD', items: [{ planPriceId: kameraStd.USD, quantity: 4 }] } },
    { day: '2026-10-20', key: 'pharm', input: { currency: 'UZS', items: [{ planPriceId: savdoPro.UZS, quantity: 1 }], trialDays: 14 } },
  ];
  // To'lov xulqi: necha kundan keyin to'laydi; qachongacha to'laydi; qaysi usul
  const payers: Record<string, { clientId: string; delay: number; until?: string; method: 'BANK_TRANSFER' | 'CASH' | 'CARD_TERMINAL' }> = {
    baraka: { clientId: baraka.id, delay: 6, method: 'BANK_TRANSFER' }, logistika: { clientId: logistika.id, delay: 3, method: 'BANK_TRANSFER' },
    tekstil: { clientId: tekstil.id, delay: 24, method: 'BANK_TRANSFER' }, orient: { clientId: orient.id, delay: 5, until: '2026-09-30', method: 'CASH' },
  };
  setTodayOverride(null);
  const realToday = todayLocal();
  await db.$executeRaw`UPDATE clients SET created_at = ${dayStart(addDays(realToday, -8))} WHERE id = ${navbahor.id}::uuid`;
  let n = 0;
  for (let d = START; d <= realToday; d = addDays(d, 1)) {
    setTodayOverride(d);
    if (d.endsWith('-01') || d.endsWith('-15') || n % 5 === 0) await ensureRate(d);
    for (const sp of subPlan.filter((x) => x.day === d)) {
      await ensureRate(d);
      await asUser(boss, () => s.subs.create(subscriptionCreateSchema.parse({ clientProjectId: cp[sp.key], startDate: d, ...sp.input })));
    }
    await s.runs.run(d);
    // To'lovlar: muddati yetgan ochiq invoice'lar bo'yicha
    for (const [key, p] of Object.entries(payers)) {
      if (p.until && d > p.until) continue;
      const due = await db.invoice.findMany({ where: { clientId: p.clientId, status: 'OPEN', issueDate: dbDate(addDays(d, -p.delay)) } });
      for (const inv of due) {
        const out = inv.totalMinor - inv.paidMinor - inv.creditedMinor;
        if (out <= 0n) continue;
        let amount = out;
        if (inv.currency === 'USD') { await ensureRate(d); const r = await s.fx.rateOn(d, db); amount = ((convertMinor(out, r!.scaled) + 99_999n) / 100_000n) * 100_000n; } // so'mda, 1000 so'mga yaxlitlab
        await asUser(boss, () => s.pays.record({
          clientId: p.clientId, method: p.method, currency: 'UZS', amount: minorToDecimalString(amount), receivedOn: d,
          externalRef: p.method === 'BANK_TRANSFER' ? `${key.slice(0, 3).toUpperCase()}-${d.replaceAll('-', '')}` : null, notes: null, receiptFileId: null, fxRate: null,
        }, boss));
      }
    }
    await s.dunning.run(d);
    // Oy yopish: keyingi oyning 5-sanasida
    if (d.endsWith('-05') && d.slice(0, 7) > START.slice(0, 7)) {
      const prev = `${addDays(d.slice(0, 8) + '01', -1).slice(0, 7)}-01`;
      const period = await db.financialPeriod.findUnique({ where: { month: dbDate(prev) } });
      if (period && !period.closedAt) {
        await ensureRate(addDays(d, -5));
        if (!period.fxRevaluedAt) await asUser(boss, () => s.runs.revalue(prev, boss));
        await asUser(boss, () => s.runs.close(prev, boss));
      }
    }
    n++;
  }
  setTodayOverride(null);
  log(`tarix: ${n} kun, invoice ${await db.invoice.count()}, to'lov ${await db.payment.count()}`);

  // Qo'shimcha: bir martalik o'rnatish invoice'i, buxgalter kiritgan (tasdiq kutayotgan) to'lov
  await asUser(accountant, () => s.pays.record({
    clientId: pharm.id, method: 'CASH', currency: 'UZS', amount: '1500000', receivedOn: realToday, externalRef: null, notes: "Naqd, kassir orqali", receiptFileId: null, fxRate: null,
  }, accountant));

  // ── Qurilmalar, versiyalar, deploymentlar ──
  const dev = async (input: Record<string, unknown>) => (await asUser(boss, () => s.devices.create(deviceCreateSchema.parse(input)))).id;
  const inst = (deviceId: string, input: Record<string, unknown>) => asUser(boss, () => s.devices.addInstallation(deviceId, installationCreateSchema.parse(input)));
  const barakaSrv: string[] = [];
  for (const [i, site] of baraka.sites.entries()) {
    const id = await dev({ name: `Filial serveri ${i + 1}`, clientId: baraka.id, siteId: site, deviceClass: 'SERVER', platform: 'LINUX', arch: 'X64', hostname: `baraka-srv-0${i + 1}`, osName: 'Ubuntu', osVersion: '24.04', tags: ['retail'] });
    await inst(id, { componentId: savdo.comps['report-server'], currentVersion: '1.3.2' });
    barakaSrv.push(id);
  }
  const kassa = await dev({ name: 'Kassa kompyuteri', clientId: baraka.id, siteId: baraka.sites[0], deviceClass: 'DESKTOP', platform: 'WINDOWS', arch: 'X64', osName: 'Windows', osVersion: '11' });
  await inst(kassa, { componentId: savdo.comps['kassa-connector'], currentVersion: '2.0.1' });
  const logSrv = await dev({ name: 'Ombor serveri', clientId: logistika.id, siteId: logistika.sites[0], deviceClass: 'SERVER', platform: 'LINUX', arch: 'X64', hostname: 'tl-wms-01', osName: 'Debian', osVersion: '12' });
  await inst(logSrv, { componentId: ombor.comps['ombor-web'], currentVersion: '3.2.0' });
  const gpu = await dev({ name: 'GPU server (AI)', ownerType: 'COMPANY', deviceClass: 'GPU_SERVER', platform: 'LINUX', arch: 'X64', hostname: 'ads-gpu-01', osName: 'Ubuntu', osVersion: '22.04', notes: 'RTX 4090 × 2, 128 GB RAM' });
  for (const k of ['tekstil', 'orient'] as const) await inst(gpu, { componentId: kamera.comps['ai-inference'], clientProjectId: cp[k], instanceName: k, currentVersion: '2.0.4' });
  const edges: string[] = [];
  for (const [i, site] of tekstil.sites.entries()) {
    const e = await dev({ name: `Edge ${i + 1} (Raspberry Pi 5)`, clientId: tekstil.id, siteId: site, deviceClass: 'EDGE_SBC', platform: 'LINUX', arch: 'ARM64', hostname: `st-edge-0${i + 1}`, osName: 'Raspberry Pi OS', osVersion: '12' });
    await inst(e, { componentId: kamera.comps['edge-collector'], currentVersion: '1.1.0' });
    edges.push(e);
    for (let j = 1; j <= 2; j++) {
      const sensor = await dev({ name: `Harorat datchigi ${i + 1}.${j}`, clientId: tekstil.id, siteId: site, deviceClass: 'MICROCONTROLLER', platform: 'ESP_IDF', arch: 'XTENSA', managementMode: 'GATEWAY_PROXIED', gatewayDeviceId: e });
      await inst(sensor, { componentId: kamera.comps['sensor-fw'], currentVersion: '0.9.1' });
    }
  }
  const rel = async (componentId: string, version: string, notes: string, channel?: string, ready = true) => {
    const r = await asUser(boss, () => s.releases.create(releaseCreateSchema.parse({ componentId, version, notes }), boss));
    if (ready) await asUser(boss, () => s.releases.markReady(r.id));
    if (channel) await asUser(boss, () => s.releases.promote(r.id, channel, boss));
    return r.id;
  };
  await rel(savdo.comps['report-server']!, '1.3.2', '- Kunlik hisobotlar\n- PDF eksport', 'stable');
  const rep140 = await rel(savdo.comps['report-server']!, '1.4.0', "- Qoldiqlar bo'yicha yangi hisobot\n- Tezlik 2× oshdi", 'stable');
  await rel(savdo.comps['report-server']!, '1.5.0-beta.1', '- Yangi dashboard (sinov)', 'beta');
  const ai210 = await rel(kamera.comps['ai-inference']!, '2.1.0', "- Yangi model: nuqsonlarni aniqlash +12%\n- GPU xotirasi tejamkor", 'stable');
  await rel(kamera.comps['sensor-fw']!, '0.9.3', '- Batareya sarfi kamaydi', undefined);
  await rel(ombor.comps['ombor-web']!, '3.3.0', "- Yangi inventarizatsiya sahifasi", undefined, false);
  // Bajarilgan deployment: 1.4.0 → Baraka filiallari (bittasi xato bilan)
  const instsRep = await db.deviceInstallation.findMany({ where: { componentId: savdo.comps['report-server'], deviceId: { in: barakaSrv } }, orderBy: { createdAt: 'asc' } });
  const dep1 = await asUser(boss, () => s.deployments.create(deploymentCreateSchema.parse({ releaseId: rep140, installationIds: instsRep.map((i) => i.id), notes: 'Tungi texnik oynada (02:00–05:00)' }), boss));
  await asUser(boss, () => s.deployments.submit(dep1.id, boss));
  const targets = await db.deploymentTarget.findMany({ where: { deploymentId: dep1.id }, orderBy: { createdAt: 'asc' } });
  for (const [i, t] of targets.entries()) {
    await asUser(boss, () => s.deployments.updateTarget(dep1.id, t.id, { status: 'INSTALLING', message: 'SSH orqali o\'rnatish boshlandi' }, boss));
    await asUser(boss, () => s.deployments.updateTarget(dep1.id, t.id, i === 2 ? { status: 'FAILED', message: "Diskda joy yetmadi (95%) — tozalab qayta urinish kerak" } : { status: 'SUCCEEDED', message: 'Health check OK' }, boss));
  }
  // Tasdiq kutayotgan deployment (menejer so'radi): AI 2.1.0 → GPU server
  const instsAi = await db.deviceInstallation.findMany({ where: { componentId: kamera.comps['ai-inference'] } });
  const dep2 = await asUser(manager, () => s.deployments.create(deploymentCreateSchema.parse({ releaseId: ai210, installationIds: instsAi.map((i) => i.id), notes: 'Yangi model — avval Samarqand Tekstil, keyin Orient' }), manager));
  await asUser(manager, () => s.deployments.submit(dep2.id, manager));
  log(`qurilmalar ${await db.device.count()}, versiyalar ${await db.release.count()}, deploymentlar ${await db.deployment.count()}`);

  const subs = await db.subscription.findMany({ select: { code: true, status: true, nextBillingOn: true } });
  log(`obunalar: ${subs.map((x) => `${x.code}:${x.status}:${fromDbDate(x.nextBillingOn)}`).join(', ')}`);
  await seedPortalDemo(db, app.get(RequestsService));
  await seedCatalogDemo(db, s.plans);
  await app.close();
}

/** Kabinet katalogi (idempotent): demo tariflar ochiq + yillik variantlar (12 oy — 10 oy narxida). */
async function seedCatalogDemo(db: Db, plans: PlansService) {
  const director = await db.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { key: 'director' } } } } });
  const run = <T>(fn: () => Promise<T>) => requestContext.run({ requestId: 'seed-catalog', ip: null, userAgent: 'seed', actor: { type: 'STAFF', id: director.id, label: director.email } }, fn);
  const boss: AuthContext = { userId: director.id, email: director.email, fullName: director.fullName, permissions: new Set(PERMISSION_KEYS), sessionId: 'seed', mfaVerified: true };
  const defs: { project: string; code: string; sort: number; features: string[] }[] = [
    { project: 'savdo-tahlil', code: 'standart', sort: 10, features: ['1 ta filial', 'Kunlik savdo va qoldiq hisobotlari', 'Kassa integratsiyasi', 'Texnik yordam 9:00–18:00'] },
    { project: 'savdo-tahlil', code: 'premium', sort: 20, features: ['1 ta filial', 'Standartdagi hammasi', 'ABC/XYZ tahlil va prognoz', 'Telegram hisobotlar', 'Ustuvor texnik yordam'] },
    { project: 'kamera-ai', code: 'kamera', sort: 10, features: ['1 ta kamera', 'Sifat va xavfsizlik nazorati (AI)', 'Hodisalar arxivi 30 kun'] },
    { project: 'ombor-avto', code: 'ombor', sort: 10, features: ['1 ta ombor', 'Kirim-chiqim va qoldiq nazorati', 'Skanerlar bilan ishlash'] },
  ];
  let changed = 0;
  for (const d of defs) {
    const proj = await db.project.findUnique({ where: { code: d.project } });
    const monthly = proj && await db.plan.findUnique({ where: { projectId_code: { projectId: proj.id, code: d.code } }, include: { prices: true } });
    if (!proj || !monthly) continue;
    if (!monthly.isPublic) {
      await run(() => plans.update(monthly.id, planUpdateSchema.parse({ name: monthly.name, description: monthly.description, isActive: true, isPublic: true, features: d.features, sortOrder: d.sort })));
      changed++;
    }
    const yearly = `${d.code}-yillik`;
    if (await db.plan.findUnique({ where: { projectId_code: { projectId: proj.id, code: yearly } } })) continue;
    const uzs = monthly.prices.find((p) => p.currency === 'UZS' && !p.validTo);
    if (!uzs) continue;
    const y = await run(() => plans.create(planCreateSchema.parse({
      projectId: proj.id, code: yearly, name: `${monthly.name} — yillik`, description: "12 oylik to'lov oldindan: 2 oy bepul", intervalMonths: 12,
      isPublic: true, features: [...d.features, "2 oy bepul (12 oy — 10 oy narxida)"], sortOrder: d.sort + 1,
    })));
    await run(() => plans.addPrice(y.id, planPriceCreateSchema.parse({ currency: 'UZS', unitAmount: minorToDecimalString(uzs.unitAmountMinor * 10n), validFrom: '2026-07-01' }), boss));
    changed++;
  }
  log(`katalog: ${changed ? `${changed} ta tarif yangilandi/qo'shildi` : "o'zgarish yo'q"}`);
}

/** Kabinet demosi (idempotent): demo mijozlarga kabinet foydalanuvchilari va namunaviy murojaatlar. Parol — README'da. */
const PORTAL_DEMO_PASSWORD = process.env.SEED_PORTAL_PASSWORD || 'Kabinet-Demo-2026!';
async function seedPortalDemo(db: Db, reqs: RequestsService) {
  const byTin = (tin: string) => db.client.findFirst({ where: { tin, deletedAt: null } });
  const hash = await hashPassword(PORTAL_DEMO_PASSWORD);
  const users = [
    { tin: '305112233', email: 'rustam@baraka.local', fullName: 'Rustam Aliyev', role: 'OWNER' },
    { tin: '305112233', email: 'dilnoza@baraka.local', fullName: 'Dilnoza Saidova', role: 'ACCOUNTANT' },
    { tin: '302445566', email: 'jahongir@logistika.local', fullName: 'Jahongir Tursunov', role: 'OWNER' },
    { tin: '307778899', email: 'farrux@tekstil.local', fullName: 'Farrux Ergashev', role: 'TECHNICIAN' },
    { tin: '304321987', email: 'bekzod@orient.local', fullName: 'Bekzod Nazarov', role: 'OWNER' },
  ] as const;
  const pu: Record<string, { id: string; clientId: string; fullName: string; email: string }> = {};
  let created = 0;
  for (const u of users) {
    const c = await byTin(u.tin);
    if (!c) continue;
    const existing = await db.portalUser.findFirst({ where: { email: u.email } });
    pu[u.email] = existing ?? (await db.portalUser.create({
      data: { clientId: c.id, email: u.email, fullName: u.fullName, portalRole: u.role, status: 'ACTIVE', passwordHash: hash, emailVerifiedAt: new Date() },
    }));
    if (!existing) created++;
  }
  log(`kabinet foydalanuvchilari: +${created} (jami ${Object.keys(pu).length})`);
  if ((await db.clientRequest.count()) || !pu['rustam@baraka.local']) return;

  const director = await db.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { key: 'director' } } } } });
  const staff: AuthContext = {
    userId: director.id, sessionId: '00000000-0000-0000-0000-000000000000', email: director.email, fullName: director.fullName, mfaVerified: true, permissions: new Set(PERMISSION_KEYS),
  };
  const asPortal = <T>(email: string, fn: (p: { portalUserId: string; clientId: string; fullName: string }) => Promise<T>) => {
    const u = pu[email]!;
    return requestContext.run({ requestId: 'seed-demo', ip: null, userAgent: 'seed', actor: { type: 'PORTAL_USER', id: u.id, label: u.email } },
      () => fn({ portalUserId: u.id, clientId: u.clientId, fullName: u.fullName }));
  };
  const asStaff = <T>(fn: () => Promise<T>) =>
    requestContext.run({ requestId: 'seed-demo', ip: null, userAgent: 'seed', actor: { type: 'STAFF', id: staff.userId, label: staff.email } }, fn);
  const subOf = async (email: string) => (await db.subscription.findFirst({ where: { clientId: pu[email]!.clientId }, orderBy: { createdAt: 'asc' } }))?.id ?? null;

  // 1) O'zgartirish so'rovi — xodim javob bergan, ichki izoh bilan (jarayonda)
  const r1 = await asPortal('rustam@baraka.local', (p) => reqs.createFromPortal(p, {
    category: 'CHANGE', subject: 'Sergeli filialiga hisobot tizimini ulash', subscriptionId: null, deviceId: null,
    body: "Assalomu alaykum! Sergeli filialimiz ham kunlik hisobotlarni ko'rishi kerak. Qo'shimcha litsenziya va o'rnatish narxini aytib bera olasizmi?",
  }));
  await db.clientRequest.update({ where: { id: r1.id }, data: { subscriptionId: await subOf('rustam@baraka.local') } });
  await asStaff(() => reqs.reply(r1.id, { body: 'Server omborda bor — payshanba kuni olib boriladi. Tarif: standart, miqdor 3 → 4.', internal: true }, staff));
  await asStaff(() => reqs.reply(r1.id, { body: "Va alaykum assalom, Rustam aka! Qo'shimcha filial oyiga 1 200 000 so'm (standart tarif). O'rnatishni payshanba kuni 10:00 da qilamiz — sizga qulaymi?" }, staff));

  // 2) Hisob-kitob savoli — hal qilingan
  const r2 = await asPortal('dilnoza@baraka.local', (p) => reqs.createFromPortal(p, {
    category: 'BILLING', subject: 'Oktyabr oyi uchun akt-sverka', subscriptionId: null, deviceId: null,
    body: "Yil yakuni uchun oktyabrgacha bo'lgan akt-sverka kerak. Imzolangan nusxasini yuborsangiz.",
  }));
  await asStaff(() => reqs.reply(r2.id, { body: "Dilnoza opa, kabinetdagi \"Akt-sverka\" bo'limida davrni tanlab, PDF'ni yuklab olishingiz mumkin. Imzolab, bir nusxasini bizga qaytarsangiz bo'ldi." }, staff));
  await asStaff(() => reqs.setStatus(r2.id, 'RESOLVED'));

  // 3) Qurilma muammosi — yangi, javob kutmoqda
  const edge = await db.device.findFirst({ where: { clientId: pu['farrux@tekstil.local']?.clientId, deviceClass: 'EDGE_SBC' }, orderBy: { createdAt: 'desc' } });
  if (pu['farrux@tekstil.local']) {
    await asPortal('farrux@tekstil.local', (p) => reqs.createFromPortal(p, {
      category: 'DEVICE', subject: "2-sexdagi Edge qurilmasi ma'lumot yubormayapti", subscriptionId: null, deviceId: edge?.id ?? null,
      body: "Bugun ertalabdan beri 2-sexdagi kameralardan hisobot kelmayapti. Qurilmani o'chirib-yoqdik, yordam bermadi.",
    }));
  }

  // 4) To'lov bo'yicha — yangi
  if (pu['bekzod@orient.local']) {
    await asPortal('bekzod@orient.local', (p) => reqs.createFromPortal(p, {
      category: 'BILLING', subject: "To'lov kechikishi va xizmatni qayta yoqish", subscriptionId: null, deviceId: null,
      body: "Oktyabr uchun to'lovni shu hafta ichida o'tkazamiz. Xizmatni bugundan qayta yoqib bera olasizmi? Kafolat xati tayyor.",
    }));
  }
  log(`murojaatlar: ${await db.clientRequest.count()}`);
}
