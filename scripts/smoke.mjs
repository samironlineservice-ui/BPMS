// Smoke test: ALOHIDA test bazasida (TEST_DATABASE_NAME, default ads_erp_test) noldan:
//   test bazasini qayta yaratish → migratsiyalar → seed → API (:3199) → asosiy oqimlar HTTP orqali.
// Asosiy baza (ads_erp) va dev serverga tegmaydi. Worker ishga tushirilmaydi.
// Ishga tushirish:  npx tsc -b && npm run smoke
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate } from 'otplib';

const root = path.resolve(import.meta.dirname, '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* CI: env tashqaridan */ }
const testDb = process.env.TEST_DATABASE_NAME ?? 'ads_erp_test';
if (!/test/i.test(testDb)) throw new Error(`Xavfsizlik: test bazasi nomida "test" bo'lishi shart (hozir: ${testDb})`);
const port = Number(process.env.SMOKE_PORT ?? 3199);
const base = `http://127.0.0.1:${port}/api/v1`;
const mainJs = path.join(root, 'apps/server/dist/main.js');
if (!fs.existsSync(mainJs)) throw new Error('apps/server/dist/main.js yo\'q — avval: npx tsc -b');

const testUrl = (name) => {
  if (!process.env[name]) throw new Error(`${name} topilmadi (.env)`);
  const u = new URL(process.env[name]);
  u.pathname = `/${testDb}`;
  return u.toString();
};
const staff = { email: 'smoke-rahbar@ads.local', password: `Smoke-${crypto.randomBytes(12).toString('base64url')}` };
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-smoke-'));
const env = {
  ...process.env, NODE_ENV: 'test', PORT: String(port),
  DATABASE_URL: testUrl('DATABASE_URL'), DATABASE_URL_PORTAL: testUrl('DATABASE_URL_PORTAL'), DATABASE_URL_MIGRATOR: testUrl('DATABASE_URL_MIGRATOR'),
  STORAGE_DIR: storageDir, TELEGRAM_BOT_TOKEN: '', CBU_RATES_URL: 'http://127.0.0.1:9/cbu-offline', MFA_ENABLED: 'true',
  SEED_DIRECTOR_EMAIL: staff.email, SEED_DIRECTOR_PASSWORD: staff.password,
};

// ── Yordamchilar ──
class SmokeFail extends Error {}
let passed = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    passed++;
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ''} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${String(e.message).split('\n').join('\n    ')}`);
    throw new SmokeFail();
  }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const is = (r, status, what) => ok(r.status === status, `${what}: kutilgan ${status}, kelgan ${r.status} ${JSON.stringify(r.data).slice(0, 400)}`);
function session() {
  let cookie = '';
  const call = async (method, p, body, { csrf = true } = {}) => {
    const r = await fetch(base + p, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(csrf ? { 'x-ads-csrf': '1' } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
  return { call, cookie: () => cookie };
}
const sh = (cmd, args, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} xato:\n${r.stdout}\n${r.stderr}`);
};
const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10); // Asia/Tashkent (UTC+5, DST yo'q)
const decimal = (minor) => `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
const roundDiv = (a, b) => (2n * a + b) / (2n * b); // musbat sonlar uchun half-up = PostgreSQL round

// ── Muhit ──
console.log(`ADS-ERP smoke test → ${testDb}, API :${port}`);
let api;
const apiLog = [];
const stopApi = () => { if (api && api.exitCode === null) api.kill('SIGTERM'); };
process.on('SIGINT', () => { stopApi(); process.exit(130); });
try {
  await step('Test bazasi, migratsiyalar, seed', async () => {
    sh(process.execPath, ['packages/db/scripts/pg.mjs', 'reset-test']);
    sh('npx', ['prisma', 'migrate', 'deploy'], path.join(root, 'packages/db'));
    sh(process.execPath, [mainJs, 'seed']);
  });
  await step('API ishga tushdi (/health/ready)', async () => {
    api = spawn(process.execPath, [mainJs, 'api'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const s of [api.stdout, api.stderr]) s.on('data', (b) => { apiLog.push(String(b)); if (apiLog.length > 200) apiLog.shift(); });
    for (let i = 0; i < 120; i++) {
      if (api.exitCode !== null) throw new Error(`API to'xtadi (kod ${api.exitCode}) — port ${port} band bo'lishi mumkin`);
      const r = await fetch(`${base}/health/ready`).then((x) => x.json()).catch(() => null);
      if (r?.db === 'ok') return;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error('60 s ichida tayyor bo\'lmadi');
  });

  // ── Xodim: auth va himoya ──
  const S = session();
  const P = session();
  let me;
  await step('Sessiyasiz so\'rov → 401', async () => is(await S.call('GET', '/clients'), 401, 'GET /clients'));
  await step('Kirish → TOTP sozlash → tasdiqlash', async () => {
    const l = await S.call('POST', '/auth/login', staff);
    is(l, 200, 'login'); ok(l.data.step === 'MFA_SETUP', `step: ${l.data.step}`);
    const s = await S.call('POST', '/auth/mfa/setup', {});
    is(s, 200, 'mfa/setup');
    is(await S.call('POST', '/auth/mfa/confirm', { code: await generate({ secret: s.data.secret }) }), 200, 'mfa/confirm');
    const m = await S.call('GET', '/auth/me');
    is(m, 200, 'me'); ok(m.data.permissions.includes('payments:approve'), 'rahbarda payments:approve yo\'q');
    me = m.data.user;
    return `${m.data.permissions.length} ta ruxsat`;
  });
  await step('CSRF sarlavhasiz o\'zgartirish → 403', async () => is(await S.call('POST', '/clients', {}, { csrf: false }), 403, 'POST /clients'));

  // ── Ma'lumotnomalar ──
  const ids = {};
  const UNIT = 100_000_000n; // 1 000 000,00 so'm
  await step('Loyiha, komponent, tarif va narx', async () => {
    const p = await S.call('POST', '/projects', { code: 'smoke-loyiha', name: 'Smoke loyiha', status: 'ACTIVE', supportedPlatforms: ['LINUX'], ownerId: me.id });
    is(p, 201, 'project'); ids.project = p.data.id;
    const c = await S.call('POST', `/projects/${ids.project}/components`, { key: 'smoke-server', name: 'Smoke server', runtime: 'SERVER_SERVICE', supportedPlatforms: ['LINUX'] });
    is(c, 201, 'component'); ids.component = c.data.id;
    const pl = await S.call('POST', '/plans', { projectId: ids.project, code: 'standart', name: 'Standart', intervalMonths: 1 });
    is(pl, 201, 'plan');
    const pr = await S.call('POST', `/plans/${pl.data.id}/prices`, { currency: 'UZS', unitAmount: decimal(UNIT), validFrom: `${today.slice(0, 7)}-01` });
    is(pr, 201, 'price'); ids.price = pr.data.id;
  });
  await step('Mijozlar, STIR dublikati → 409, loyihaga bog\'lash', async () => {
    const mk = (name, tin) => S.call('POST', '/clients', { type: 'COMPANY', status: 'ACTIVE', legalName: `"${name}" MChJ`, displayName: name, tin });
    const a = await mk('Smoke A', '300000001'); is(a, 201, 'client A'); ids.clientA = a.data.id;
    const b = await mk('Smoke B', '300000002'); is(b, 201, 'client B'); ids.clientB = b.data.id;
    is(await mk('Smoke A2', '300000001'), 409, 'dublikat STIR');
    for (const k of ['A', 'B']) {
      const l = await S.call('POST', '/client-projects', { clientId: ids[`client${k}`], projectId: ids.project, status: 'ACTIVE' });
      is(l, 201, `link ${k}`); ids[`cp${k}`] = l.data.id;
    }
  });

  // ── Billing ──
  const dim = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const days = BigInt(dim - Number(today.slice(8, 10)) + 1);
  const expectedA = roundDiv(2n * UNIT * days, BigInt(dim)); // 2 dona, birinchi oy — kunlik proration
  await step('USD kursi (qo\'lda kiritish)', async () => {
    const r = await S.call('POST', '/finance/fx-rates', { date: today, rate: '12000.00' });
    ok(r.status === 201 || r.status === 200, `fx: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  });
  await step('Obunalar → billing run → invoice (proration)', async () => {
    for (const [k, quantity] of [['A', 2], ['B', 1]]) {
      const r = await S.call('POST', '/subscriptions', { clientProjectId: ids[`cp${k}`], startDate: today, currency: 'UZS', items: [{ planPriceId: ids.price, quantity }] });
      is(r, 201, `subscription ${k}`);
    }
    const run = await S.call('POST', '/billing/run', {});
    ok(run.status === 201 || run.status === 200, `billing/run: ${run.status} ${JSON.stringify(run.data).slice(0, 300)}`);
    for (const k of ['A', 'B']) {
      const l = await S.call('GET', `/invoices?clientId=${ids[`client${k}`]}`);
      is(l, 200, `invoices ${k}`); ok(l.data.items.length === 1, `${k}: ${l.data.items.length} ta invoice`);
      ids[`inv${k}`] = l.data.items[0];
    }
    const inv = ids.invA;
    ok(/^INV-\d{4}-\d{6}$/.test(inv.number), `raqam: ${inv.number}`);
    ok(inv.status === 'OPEN', `status: ${inv.status}`);
    ok(BigInt(inv.totalMinor) === expectedA, `jami ${inv.totalMinor}, kutilgan ${expectedA} (${days}/${dim} kun)`);
    return `${inv.number}, ${days}/${dim} kun`;
  });
  await step('Billing run qayta → dublikat yo\'q (idempotent)', async () => {
    await S.call('POST', '/billing/run', {});
    const l = await S.call('GET', `/invoices?clientId=${ids.clientA}`);
    ok(l.data.items.length === 1, `${l.data.items.length} ta invoice`);
  });
  await step('Bank to\'lovi → avtomatik taqsimlash → invoice PAID', async () => {
    const r = await S.call('POST', '/payments', {
      clientId: ids.clientA, method: 'BANK_TRANSFER', currency: 'UZS', amount: decimal(expectedA), receivedOn: today,
      externalRef: 'SMOKE-0001', notes: null, receiptFileId: null, fxRate: null,
    });
    is(r, 201, 'payment'); ok(r.data.status === 'POSTED', `to'lov holati: ${r.data.status}`);
    const inv = await S.call('GET', `/invoices/${ids.invA.id}`);
    ok(inv.data.status === 'PAID' && BigInt(inv.data.paidMinor) === expectedA, `invoice: ${inv.data.status}, to'langan ${inv.data.paidMinor}`);
    is(await S.call('POST', '/payments', { clientId: ids.clientA, method: 'BANK_TRANSFER', currency: 'UZS', amount: '1.00', receivedOn: today, externalRef: 'SMOKE-0001' }), 409, 'bir xil bank hujjati');
  });
  await step('Ledger: sinov balansi Σ = 0, akt-sverka qoldig\'i 0', async () => {
    const tb = await S.call('GET', '/finance/trial-balance');
    is(tb, 200, 'trial-balance');
    const sum = tb.data.reduce((a, r) => a + BigInt(r.balanceUzsMinor), 0n);
    ok(sum === 0n, `Σ = ${sum}`);
    const st = await S.call('GET', `/finance/statement?clientId=${ids.clientA}&currency=UZS&from=${today.slice(0, 7)}-01&to=${today}`);
    is(st, 200, 'statement'); ok(st.data.closingMinor === '0' && st.data.lines.length >= 2, `qoldiq ${st.data.closingMinor}, ${st.data.lines.length} qator`);
  });
  await step('Invoice PDF', async () => {
    const r = await fetch(`${base}/invoices/${ids.invA.id}/pdf`, { headers: { cookie: S.cookie() } });
    const buf = Buffer.from(await r.arrayBuffer());
    ok(r.status === 200 && buf.subarray(0, 4).toString() === '%PDF', `status ${r.status}, ${buf.subarray(0, 8)}`);
    return `${Math.round(buf.length / 1024)} KB`;
  });
  await step('Dashboard: MRR va obunalar', async () => {
    const d = await S.call('GET', '/dashboard');
    is(d, 200, 'dashboard');
    ok(d.data.finance.mrrUzsMinor === String(3n * UNIT), `MRR ${d.data.finance.mrrUzsMinor}`);
    ok(d.data.finance.subscriptions.active === 2, `faol obunalar: ${JSON.stringify(d.data.finance.subscriptions)}`);
  });

  // ── Mijoz kabineti ──
  await step('Kabinet: taklif → parol → kirish → faqat o\'z invoice\'lari', async () => {
    const inv = await S.call('POST', `/clients/${ids.clientA}/portal-users`, { email: 'smoke-mijoz@ads.local', fullName: 'Smoke Mijoz', portalRole: 'OWNER' });
    is(inv, 201, 'portal invite');
    const token = new URL(inv.data.inviteUrl).searchParams.get('token');
    const pw = (ids.portalPw = `Mijoz-${crypto.randomBytes(9).toString('base64url')}`);
    is(await P.call('POST', '/portal/auth/invite/accept', { token, password: pw }), 200, 'invite accept');
    is(await P.call('POST', '/portal/auth/login', { email: 'smoke-mijoz@ads.local', password: pw }), 200, 'portal login');
    const l = await P.call('GET', '/portal/invoices');
    is(l, 200, 'portal invoices'); ok(l.data.length === 1 && l.data[0].id === ids.invA.id, `${l.data.length} ta invoice`);
  });
  await step('Kabinet izolyatsiyasi: begona invoice → 404, cookie\'lar aralashmaydi', async () => {
    is(await P.call('GET', `/portal/invoices/${ids.invB.id}`), 404, 'begona invoice');
    const a = await fetch(`${base}/clients`, { headers: { cookie: P.cookie() } });
    ok(a.status === 401, `portal cookie → xodim API: ${a.status}`);
    const b = await fetch(`${base}/portal/summary`, { headers: { cookie: S.cookie() } });
    ok(b.status === 401, `xodim cookie → portal API: ${b.status}`);
  });

  // ── Qurilmalar va deployment ──
  await step('Qurilma → reliz → deployment → versiya yangilandi', async () => {
    const d = await S.call('POST', '/devices', { name: 'Smoke server', ownerType: 'CLIENT', clientId: ids.clientA, deviceClass: 'SERVER', platform: 'LINUX', arch: 'X64' });
    is(d, 201, 'device');
    const i = await S.call('POST', `/devices/${d.data.id}/installations`, { componentId: ids.component, currentVersion: '1.0.0' });
    is(i, 201, 'installation');
    const r = await S.call('POST', '/releases', { componentId: ids.component, version: '1.1.0', notes: '- Smoke reliz' });
    is(r, 201, 'release');
    is(await S.call('POST', `/releases/${r.data.id}/ready`), 201, 'release ready');
    const dep = await S.call('POST', '/deployments', { releaseId: r.data.id, installationIds: [i.data.id], notes: 'smoke' });
    is(dep, 201, 'deployment');
    is(await S.call('POST', `/deployments/${dep.data.id}/submit`), 201, 'submit');
    let dd = (await S.call('GET', `/deployments/${dep.data.id}`)).data;
    ok(dd.status === 'RUNNING', `deployment: ${dd.status}`);
    for (const status of ['INSTALLING', 'SUCCEEDED']) is(await S.call('PATCH', `/deployments/${dep.data.id}/targets/${dd.targets[0].id}`, { status, message: 'smoke' }), 200, status);
    dd = (await S.call('GET', `/deployments/${dep.data.id}`)).data;
    const dev = (await S.call('GET', `/devices/${d.data.id}`)).data;
    ok(dd.status === 'COMPLETED' && dev.installations[0]?.currentVersion === '1.1.0', `deployment ${dd.status}, versiya ${dev.installations[0]?.currentVersion}`);
  });
  // ── Mijoz kabineti v2 ──
  await step('Kabinet: dashboard, obuna tafsiloti, to\'lov taqsimoti, akt-sverka PDF', async () => {
    const d = await P.call('GET', '/portal/dashboard');
    is(d, 200, 'dashboard');
    ok(d.data.status === 'OK' && d.data.finance?.monthly?.[0]?.amountMinor === String(2n * UNIT), `holat ${d.data.status}, oylik ${JSON.stringify(d.data.finance?.monthly)}`);
    ok(d.data.services.length === 1 && d.data.devices.total === 1, `xizmatlar ${d.data.services.length}, qurilmalar ${d.data.devices.total}`);
    const subs = await P.call('GET', '/portal/subscriptions');
    is(subs, 200, 'subscriptions'); ids.subA = subs.data[0].id;
    const sd = await P.call('GET', `/portal/subscriptions/${ids.subA}`);
    is(sd, 200, 'subscription detail');
    ok(sd.data.history.length >= 1 && sd.data.invoices?.length === 1 && sd.data.installations[0]?.currentVersion === '1.1.0',
      `tarix ${sd.data.history.length}, invoice ${sd.data.invoices?.length}, o'rnatma ${JSON.stringify(sd.data.installations[0])}`);
    const pays = await P.call('GET', '/portal/payments');
    ok(pays.data[0]?.allocations?.[0]?.invoiceNumber === ids.invA.number, `taqsimot: ${JSON.stringify(pays.data[0]?.allocations)}`);
    const pdf = await fetch(`${base}/portal/statement/pdf?currency=UZS`, { headers: { cookie: P.cookie() } });
    const buf = Buffer.from(await pdf.arrayBuffer());
    ok(pdf.status === 200 && buf.subarray(0, 4).toString() === '%PDF', `akt-sverka PDF: ${pdf.status}`);
    is(await P.call('GET', '/portal/company'), 200, 'company');
  });
  await step('Murojaat: mijoz → xodim (ichki izoh yashirin) → mijoz → yopish', async () => {
    const subsAll = await S.call('GET', '/subscriptions?pageSize=50');
    const subB = subsAll.data.items.find((x) => x.client.id === ids.clientB);
    ok(subB, 'B obunasi topilmadi');
    is(await P.call('POST', '/portal/requests', { category: 'CHANGE', subject: 'Begona obuna', body: 'IDOR', subscriptionId: subB.id }), 400, 'begona obuna biriktirish');
    const c = await P.call('POST', '/portal/requests', { category: 'SUPPORT', subject: 'Smoke murojaat', body: 'Hisobot sekin ochilyapti', subscriptionId: ids.subA });
    is(c, 201, 'murojaat'); ok(/^REQ-\d{4}-\d{4}$/.test(c.data.code), `kod ${c.data.code}`);
    const counts = await S.call('GET', '/requests/counts');
    ok(counts.data.unread >= 1, `xodim: o'qilmagan ${counts.data.unread}`);
    is(await S.call('POST', `/requests/${c.data.id}/messages`, { body: 'Ichki izoh: serverni tekshirish kerak', internal: true }), 201, 'ichki izoh');
    is(await S.call('POST', `/requests/${c.data.id}/messages`, { body: "Tekshiryapmiz, bugun hal qilamiz" }), 201, 'javob');
    const list = await P.call('GET', '/portal/requests');
    ok(list.data[0]?.unread === true, 'mijozda "yangi javob" belgisi yo\'q');
    const det = await P.call('GET', `/portal/requests/${c.data.id}`);
    ok(det.data.messages.length === 2 && det.data.messages.every((m) => !m.internal && !m.body.startsWith('Ichki')) && det.data.status === 'IN_PROGRESS',
      `xabarlar ${det.data.messages.length}, holat ${det.data.status}`);
    is(await P.call('POST', `/portal/requests/${c.data.id}/messages`, { body: 'Rahmat!' }), 201, 'mijoz javobi');
    const sdet = await S.call('GET', `/requests/${c.data.id}`);
    ok(sdet.data.messages.length === 4 && sdet.data.messages.some((m) => m.internal), `xodim ko'radi: ${sdet.data.messages.length} xabar`);
    is(await P.call('POST', `/portal/requests/${c.data.id}/close`), 200, 'yopish');
    is(await P.call('POST', `/portal/requests/${c.data.id}/messages`, { body: 'Yana' }), 409, 'yopilganga yozish');
    return c.data.code;
  });
  const T = session();
  await step('Kabinet rollari: texnik moliyani ko\'rmaydi, jamoa — faqat egasi', async () => {
    const inv = await P.call('POST', '/portal/team', { email: 'smoke-texnik@ads.local', fullName: 'Smoke Texnik', portalRole: 'TECHNICIAN' });
    is(inv, 201, 'jamoaga taklif');
    const tpw = `Texnik-${crypto.randomBytes(9).toString('base64url')}`;
    is(await T.call('POST', '/portal/auth/invite/accept', { token: new URL(inv.data.inviteUrl).searchParams.get('token'), password: tpw }), 200, 'texnik: taklif');
    is(await T.call('POST', '/portal/auth/login', { email: 'smoke-texnik@ads.local', password: tpw }), 200, 'texnik: kirish');
    const me = await T.call('GET', '/portal/auth/me');
    ok(me.data.access.finance === false && me.data.access.team === false && me.data.access.writeRequests === true, `access ${JSON.stringify(me.data.access)}`);
    is(await T.call('GET', '/portal/invoices'), 403, 'texnik → invoice');
    is(await T.call('GET', '/portal/team'), 403, 'texnik → jamoa');
    const td = await T.call('GET', '/portal/dashboard');
    ok(td.status === 200 && td.data.finance === null && td.data.services[0]?.mrrMinor === null, `texnik dashboard: finance ${JSON.stringify(td.data.finance)}`);
    const ts = await T.call('GET', '/portal/subscriptions');
    ok(ts.data[0]?.mrrMinor === null && ts.data[0]?.items[0]?.unitAmountMinor === null, 'texnikka narx ko\'rinmasligi kerak');
    is(await T.call('POST', '/portal/requests', { category: 'DEVICE', subject: 'Qurilma tekshiruvi', body: 'Server qizib ketyapti' }), 201, 'texnik: murojaat');
    const team = await P.call('GET', '/portal/team');
    ok(team.data.length === 2 && team.data.some((m) => m.isMe), `jamoa: ${team.data.length}`);
  });
  await step('Kabinet: parolni almashtirish', async () => {
    is(await P.call('POST', '/portal/auth/password', { currentPassword: 'notogri-parol-123', newPassword: 'Yangi-Kabinet-Paroli-1' }), 400, "noto'g'ri joriy parol");
    is(await P.call('POST', '/portal/auth/password', { currentPassword: ids.portalPw, newPassword: 'Yangi-Kabinet-Paroli-1' }), 200, 'parol');
    is(await P.call('GET', '/portal/dashboard'), 200, 'joriy sessiya saqlanadi');
  });
  const R = session();
  await step("Kabinet: o'zi ro'yxatdan o'tish → lid mijoz, avtomatik kirish, murojaat", async () => {
    const cfg = await R.call('GET', '/portal/auth/config');
    ok(cfg.status === 200 && cfg.data.registration === true, `config ${JSON.stringify(cfg.data)}`);
    const reg = {
      type: 'COMPANY', companyName: 'Smoke Yangi MChJ', tin: '300000009', fullName: 'Yangi Mijoz', phone: '+998 90 111 22 33',
      email: 'smoke-yangi@ads.local', password: 'Yangi-Kabinet-Parol-1', message: "3 ta do'kon uchun hisobot kerak", consent: true,
    };
    is(await R.call('POST', '/portal/auth/register', { ...reg, consent: false }), 400, 'roziliksiz');
    is(await R.call('POST', '/portal/auth/register', { ...reg, website: 'spam' }), 400, 'bot maydoni');
    is(await R.call('POST', '/portal/auth/register', { ...reg, tin: '300000001' }), 409, 'mavjud STIR (boshqa kompaniyaga ulanib bo\'lmaydi)');
    is(await R.call('POST', '/portal/auth/register', { ...reg, email: 'smoke-mijoz@ads.local', tin: null }), 409, 'mavjud email');
    is(await R.call('POST', '/portal/auth/register', reg), 200, "ro'yxatdan o'tish");
    const me = await R.call('GET', '/portal/auth/me');
    ok(me.status === 200 && me.data.user.role === 'OWNER' && me.data.client.name === 'Smoke Yangi MChJ', `me ${JSON.stringify(me.data).slice(0, 200)}`);
    const d = await R.call('GET', '/portal/dashboard');
    ok(d.data.services.length === 0 && d.data.requests.open === 1, `lid: xizmat ${d.data.services.length}, murojaat ${d.data.requests.open}`);
    const inv = await R.call('GET', '/portal/invoices');
    ok(inv.status === 200 && inv.data.length === 0, `lidga begona invoice ko'rinmasligi kerak: ${inv.data.length}`);
    const c = await S.call('GET', '/clients?q=Smoke%20Yangi');
    const lead = c.data.items?.[0];
    ok(lead?.status === 'LEAD' && lead.tags.includes('kabinet orqali'), `xodim ko'radi: ${JSON.stringify(lead)?.slice(0, 200)}`);
    return lead.code;
  });
  // ── Onlayn to'lov tizimlari (Payme, Click, Uzum, Paynet) — emulyator haqiqiy protokol bo'yicha webhook'larni chaqiradi ──
  const PAYME_KEY = 'emulator-payme-key'; // emulyatorning standart kaliti (faqat lokal; production'da emulyator o'chiq)
  const ONL = 50_000_000n; // 500 000,00 so'm
  const card1 = { cardNumber: '8600069195406311', expire: '0399', smsCode: '666666' }; // Payme sandbox'ining ommaviy sinov kartasi
  const basicAuth = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
  const raw = async (p, body, headers) => {
    const r = await fetch(base + p, { method: 'POST', body, headers });
    const t = await r.text();
    let data; try { data = JSON.parse(t); } catch { data = t; }
    return { status: r.status, data };
  };
  const payme = (method, params, auth = basicAuth('Paycom', PAYME_KEY)) =>
    raw('/gateways/payme', JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), { 'content-type': 'application/json', authorization: auth });
  const waitFor = async (fn, what) => {
    for (let i = 0; i < 60; i++) { const v = await fn(); if (v) return v; await new Promise((res) => setTimeout(res, 250)); }
    throw new Error(`kutilgan holat bo'lmadi: ${what}`);
  };
  const waitFulfilled = (sess, orderId) => waitFor(async () => {
    const r = await sess.call('GET', `/portal/pay/orders/${orderId}`);
    return r.data?.checkout?.status === 'FULFILLED' ? r.data : null;
  }, `checkout ${orderId} → FULFILLED`);
  const mkPlan = async (projectId, code, intervalMonths, amount) => {
    const pl = await S.call('POST', '/plans', { projectId, code, name: `Smoke ${code}`, intervalMonths, isPublic: true, features: ['Smoke imkoniyat'], sortOrder: 1 });
    is(pl, 201, `plan ${code}`);
    const pr = await S.call('POST', `/plans/${pl.data.id}/prices`, { currency: 'UZS', unitAmount: decimal(amount), validFrom: `${today.slice(0, 7)}-01` });
    is(pr, 201, `price ${code}`);
    return pr.data.id;
  };
  await step("To'lov tizimlari: emulyator rejimi, sozlama validatsiyasi, katalog", async () => {
    const g = await S.call('GET', '/gateways/config');
    is(g, 200, 'gateways/config');
    ok(g.data.length === 4 && g.data.every((c) => c.mode === 'EMULATOR' && c.enabled && c.callbackUrls.length), `config: ${JSON.stringify(g.data.map((c) => [c.provider, c.mode, c.enabled]))}`);
    is(await S.call('PUT', '/gateways/config/PAYME', { enabled: true, mode: 'TEST', merchantId: '', settings: {}, secrets: {} }), 400, 'kalitlarsiz TEST rejimi');
    ids.onlMonthly = await mkPlan(ids.project, 'onlayn', 1, ONL);
    ids.onlYearly = await mkPlan(ids.project, 'onlayn-yillik', 12, ONL * 10n);
    for (const [k, code, amount] of [['project2', 'ikkinchi', 30_000_000n], ['project3', 'uchinchi', 20_000_000n]]) {
      const p = await S.call('POST', '/projects', { code: `smoke-${code}`, name: `Smoke ${code}`, status: 'ACTIVE', supportedPlatforms: ['LINUX'], ownerId: me.id });
      is(p, 201, `project ${code}`); ids[k] = p.data.id;
      ids[`${k}Price`] = await mkPlan(p.data.id, code, 1, amount);
    }
    const cat = await R.call('GET', '/portal/catalog');
    is(cat, 200, 'katalog');
    const p1 = cat.data.find((x) => x.projectId === ids.project);
    ok(cat.data.length === 3 && p1?.plans.length === 2 && p1.plans.every((x) => !x.subscribed), `katalog: ${JSON.stringify(cat.data).slice(0, 300)}`);
    const catA = await P.call('GET', '/portal/catalog');
    ok(catA.data.find((x) => x.projectId === ids.project)?.plans.every((x) => x.subscribed), "A mijozda obuna bor — subscribed bo'lishi kerak");
    is(await T.call('GET', '/portal/catalog'), 403, 'texnik → katalog');
    is(await T.call('POST', '/portal/checkout', { items: [{ planPriceId: ids.onlMonthly, quantity: 1 }], method: 'PAYME' }), 403, 'texnik → checkout');
    return 'Payme, Click, Uzum, Paynet — emulyator';
  });
  await step("Checkout (Payme emulyatori): to'lov → obuna → invoice to'langan", async () => {
    const items = [{ planPriceId: ids.onlMonthly, quantity: 1 }];
    const expected = roundDiv(ONL * days, BigInt(dim));
    const q = await R.call('POST', '/portal/checkout/quote', { items });
    is(q, 200, 'quote'); ok(BigInt(q.data.amountMinor) === expected, `quote ${q.data.amountMinor}, kutilgan ${expected}`);
    is(await R.call('POST', '/portal/checkout/quote', { items: [...items, { planPriceId: ids.onlYearly, quantity: 1 }] }), 400, 'oylik + yillik aralash');
    const c = await R.call('POST', '/portal/checkout', { items, method: 'PAYME' });
    is(c, 201, 'checkout'); ok(c.data.redirectUrl?.includes(`/pay/emulator/${c.data.orderId}`), `redirect: ${c.data.redirectUrl}`);
    is(await R.call('POST', `/portal/pay/emulator/${c.data.orderId}`, { provider: 'PAYME', ...card1, smsCode: '000000' }), 400, "noto'g'ri SMS kod");
    is(await R.call('POST', `/portal/pay/emulator/${c.data.orderId}`, { provider: 'CLICK', ...card1 }), 400, 'boshqa provayder');
    const e = await R.call('POST', `/portal/pay/emulator/${c.data.orderId}`, { provider: 'PAYME', ...card1 });
    is(e, 200, 'emulyator'); ok(e.data.ok && e.data.steps.every((x) => x.ok), `emulyator: ${JSON.stringify(e.data)}`);
    const names = e.data.steps.map((x) => x.name).join(',');
    ok(names.includes('CheckPerformTransaction') && names.includes('PerformTransaction'), `qadamlar: ${names}`);
    const st = await waitFulfilled(R, c.data.orderId);
    ok(st.status === 'PAID' && st.checkout.subscriptionId, `holat ${JSON.stringify(st)}`);
    const subs = await R.call('GET', '/portal/subscriptions');
    ok(subs.data.length === 1 && subs.data[0].status === 'ACTIVE', `obunalar: ${JSON.stringify(subs.data.map((x) => x.status))}`);
    const inv = await R.call('GET', '/portal/invoices');
    ok(inv.data.length === 1 && inv.data[0].status === 'PAID' && BigInt(inv.data[0].totalMinor) === expected, `invoice: ${JSON.stringify(inv.data.map((i) => [i.status, i.totalMinor]))}`);
    is(await R.call('POST', '/portal/checkout', { items, method: 'PAYME' }), 409, 'ikkinchi marta obuna');
    is(await R.call('POST', `/portal/pay/emulator/${c.data.orderId}`, { provider: 'PAYME', ...card1 }), 400, "to'langan buyurtmani qayta to'lash");
    return `${decimal(expected)} so'm, ${e.data.steps.length} ta protokol chaqiruvi`;
  });
  await step("Payme protokoli: auth, buzuq JSON, bekor qilish, takroriy so'rovlar, GetStatement", async () => {
    const account = (await R.call('GET', '/portal/auth/me')).data.client.accountNo; // shaxsiy hisob (OPEN_TOPUP)
    const a = await payme('CheckPerformTransaction', { amount: 1_000_000, account: { order_id: account } }, basicAuth('Paycom', 'notogri'));
    ok(a.status === 200 && a.data.error?.code === -32504, `auth: ${JSON.stringify(a.data)}`);
    const bad = await raw('/gateways/payme', '{buzuq json', { 'content-type': 'application/json', authorization: basicAuth('Paycom', PAYME_KEY) });
    ok(bad.status === 200 && bad.data.error?.code === -32700, `json: ${bad.status} ${JSON.stringify(bad.data)}`);
    ok((await payme('CheckPerformTransaction', { amount: 1_000_000, account: { order_id: '99999999' } })).data.error?.code === -31050, 'topilmagan hisob → -31050');
    ok((await payme('CheckPerformTransaction', { amount: 100, account: { order_id: account } })).data.error?.code === -31001, 'kichik summa → -31001');
    const t = Date.now();
    const idX = crypto.randomBytes(12).toString('hex');
    const cx = await payme('CreateTransaction', { id: idX, time: t, amount: 1_000_000, account: { order_id: account } });
    ok(cx.data.result?.state === 1, `create: ${JSON.stringify(cx.data)}`);
    const cx2 = await payme('CreateTransaction', { id: idX, time: t, amount: 1_000_000, account: { order_id: account } });
    ok(cx2.data.result?.transaction === cx.data.result.transaction, "takroriy Create — o'sha tranzaksiya");
    ok((await payme('CancelTransaction', { id: idX, reason: 3 })).data.result?.state === -1, 'cancel → -1');
    ok((await payme('PerformTransaction', { id: idX })).data.error?.code === -31008, 'bekor qilinganni bajarish → -31008');
    const chk = await payme('CheckTransaction', { id: idX });
    ok(chk.data.result?.state === -1 && chk.data.result?.reason === 3, `check: ${JSON.stringify(chk.data)}`);
    const idY = crypto.randomBytes(12).toString('hex');
    ok((await payme('CreateTransaction', { id: idY, time: Date.now(), amount: 1_500_000, account: { order_id: account } })).data.result?.state === 1, 'create Y');
    const pf = await payme('PerformTransaction', { id: idY });
    ok(pf.data.result?.state === 2, `perform: ${JSON.stringify(pf.data)}`);
    ok((await payme('PerformTransaction', { id: idY })).data.result?.perform_time === pf.data.result.perform_time, "takroriy Perform — o'sha natija");
    ok((await payme('CancelTransaction', { id: idY, reason: 5 })).data.error?.code === -31007, 'bajarilganni bekor qilish → -31007');
    ok((await payme('PerformTransaction', { id: 'yoq-tranzaksiya' })).data.error?.code === -31003, 'topilmagan → -31003');
    const gs = await payme('GetStatement', { from: t - 60_000, to: Date.now() + 60_000 });
    ok(gs.data.result?.transactions.some((x) => x.id === idY && x.state === 2), `statement: ${JSON.stringify(gs.data).slice(0, 300)}`);
    const pays = await R.call('GET', '/portal/payments');
    ok(pays.data.some((p) => p.method === 'PAYME' && p.amountMinor === '1500000'), `to'lovlar: ${JSON.stringify(pays.data.map((p) => [p.method, p.amountMinor]))}`);
    return 'Check/Create/Perform/Cancel/CheckTransaction/GetStatement';
  });
  await step("Click (emulyator): imzo tekshiruvi, rad etilgan to'lov, invoice'ni kabinetdan to'lash", async () => {
    const f = { click_trans_id: '1', service_id: '99999', click_paydoc_id: '1', merchant_trans_id: '12345678', amount: '1000.00', action: '0', error: '0', error_note: 'Success', sign_time: '2026-01-01 00:00:00', sign_string: 'f'.repeat(32) };
    const badSign = await raw('/gateways/click/prepare', new URLSearchParams(f).toString(), { 'content-type': 'application/x-www-form-urlencoded' });
    ok(badSign.status === 200 && badSign.data.error === -1, `imzo: ${JSON.stringify(badSign.data)}`);
    // Xodim A mijozga 2-loyiha obunasini ochadi → ochiq invoice; mijoz uni kabinetdan Click orqali to'laydi
    const l = await S.call('POST', '/client-projects', { clientId: ids.clientA, projectId: ids.project2, status: 'ACTIVE' });
    is(l, 201, 'A → 2-loyiha');
    is(await S.call('POST', '/subscriptions', { clientProjectId: l.data.id, startDate: today, currency: 'UZS', items: [{ planPriceId: ids.project2Price, quantity: 1 }] }), 201, 'obuna A2');
    const open = await P.call('GET', '/portal/invoices?status=open');
    ok(open.data.length === 1, `ochiq invoice: ${open.data.length}`);
    const invId = open.data[0].id;
    const pay = await P.call('POST', '/portal/invoices/pay', { invoiceIds: [invId], method: 'CLICK' });
    is(pay, 201, 'invoices/pay'); ok(pay.data.redirectUrl?.includes('provider=CLICK'), `redirect: ${pay.data.redirectUrl}`);
    const dec = await P.call('POST', `/portal/pay/emulator/${pay.data.orderId}`, { provider: 'CLICK', scenario: 'decline', ...card1 });
    ok(dec.status === 200 && dec.data.ok === false, `rad etish: ${JSON.stringify(dec.data)}`);
    ok((await P.call('GET', `/portal/pay/orders/${pay.data.orderId}`)).data.status === 'PENDING', 'rad etilgandan keyin buyurtma ochiq qoladi');
    const e = await P.call('POST', `/portal/pay/emulator/${pay.data.orderId}`, { provider: 'CLICK', ...card1 });
    ok(e.data.ok, `click: ${JSON.stringify(e.data)}`);
    const rep = e.data.steps.find((x) => x.name.includes('takroriy'));
    ok(rep?.detail.includes('error=-4'), `takroriy Complete → -4: ${JSON.stringify(rep)}`);
    const inv = await waitFor(async () => { const r = await P.call('GET', `/portal/invoices/${invId}`); return r.data.status === 'PAID' ? r.data : null; }, 'invoice PAID');
    return `${inv.number} to'landi`;
  });
  await step("Uzum va Paynet: shaxsiy hisob raqami bilan to'ldirish → kredit, noto'g'ri auth", async () => {
    const u = await R.call('POST', '/portal/pay/emulator/topup', { provider: 'UZUM', amount: '150000', ...card1 });
    ok(u.status === 200 && u.data.ok, `uzum: ${JSON.stringify(u.data)}`);
    const n = await R.call('POST', '/portal/pay/emulator/topup', { provider: 'PAYNET', amount: '250000' });
    ok(n.status === 200 && n.data.ok, `paynet: ${JSON.stringify(n.data)}`);
    ok(n.data.steps.some((x) => x.name === 'PerformTransaction' && !x.ok && x.detail.startsWith('201')), 'takroriy PerformTransaction → 201');
    is(await R.call('POST', '/portal/pay/emulator/topup', { provider: 'PAYNET', amount: '5' }), 400, 'minimal summa');
    const methods = (await R.call('GET', '/portal/payments')).data.map((p) => p.method);
    ok(methods.includes('UZUM') && methods.includes('PAYNET'), `to'lovlar: ${methods}`);
    const pa = await raw('/gateways/paynet', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'GetInformation', params: { serviceId: 777, fields: { account: '12345678' } } }), { 'content-type': 'application/json', authorization: basicAuth('paynet', 'notogri') });
    ok(pa.status === 401, `paynet auth: ${pa.status}`);
    const ua = await raw('/gateways/uzum/check', JSON.stringify({ serviceId: 100500, timestamp: Date.now(), params: { account: '12345678' } }), { 'content-type': 'application/json', authorization: basicAuth('uzum', 'notogri') });
    ok(ua.status === 400 && ua.data.errorCode === '10001', `uzum auth: ${ua.status} ${JSON.stringify(ua.data)}`);
    const credit = (await R.call('GET', '/portal/dashboard')).data.finance.balances.find((b) => b.currency === 'UZS')?.creditMinor;
    ok(BigInt(credit ?? 0) >= 41_500_000n, `kredit: ${credit}`);
    return `kredit ${decimal(BigInt(credit))} so'm`;
  });
  await step("Kartalar: Payme (Subscribe API) va Click — SMS, avtomatik to'lov, karta bilan obuna", async () => {
    const m = await R.call('GET', '/portal/pay/methods');
    ok(m.status === 200 && m.data.paymeCards && m.data.testCards?.length === 2, `methods: ${JSON.stringify(m.data).slice(0, 300)}`);
    const sub = async (method, params) => (await raw('/gateways/emulator/payme-api', JSON.stringify({ id: 1, method, params }), { 'content-type': 'application/json', 'x-auth': m.data.paymeCards.merchantId })).data;
    const cr = await sub('cards.create', { card: { number: card1.cardNumber, expire: card1.expire }, save: true });
    ok(cr.result?.card?.token && cr.result.card.verify === false, `cards.create: ${JSON.stringify(cr)}`);
    is(await R.call('POST', '/portal/cards/payme', { provider: 'PAYME', token: cr.result.card.token }), 400, 'tasdiqlanmagan karta');
    ok((await sub('cards.get_verify_code', { token: cr.result.card.token })).result?.sent === true, 'SMS yuborildi');
    ok((await sub('cards.verify', { token: cr.result.card.token, code: '111111' })).error, "noto'g'ri SMS");
    const vf = await sub('cards.verify', { token: cr.result.card.token, code: card1.smsCode });
    ok(vf.result?.card?.verify === true, `cards.verify: ${JSON.stringify(vf)}`);
    const pc = await R.call('POST', '/portal/cards/payme', { provider: 'PAYME', token: vf.result.card.token });
    is(pc, 201, 'payme karta');
    ok(pc.data.isDefault && pc.data.maskedPan.includes('*') && !JSON.stringify(pc.data).includes(card1.cardNumber), `payme karta: ${JSON.stringify(pc.data)}`);
    const cc = await R.call('POST', '/portal/cards/click', { cardNumber: '8600 4954 7331 6478', expire: '03/99' });
    is(cc, 201, "click karta so'rovi"); ok(cc.data.phoneMask, 'telefon');
    is(await R.call('POST', `/portal/cards/${cc.data.cardId}/verify`, { smsCode: '123456' }), 400, "click: noto'g'ri SMS");
    const cv = await R.call('POST', `/portal/cards/${cc.data.cardId}/verify`, { smsCode: card1.smsCode });
    is(cv, 200, 'click tasdiq'); ok(cv.data.status === 'ACTIVE' && !cv.data.isDefault, `click karta: ${JSON.stringify(cv.data)}`);
    is(await R.call('POST', `/portal/cards/${cc.data.cardId}/settings`, { autopay: true }), 200, "avtomatik to'lov");
    const list = await R.call('GET', '/portal/cards');
    ok(list.data.length === 2 && list.data.filter((c) => c.autopay).length === 1 && list.data[0].isDefault, `kartalar: ${JSON.stringify(list.data.map((c) => [c.provider, c.isDefault, c.autopay]))}`);
    ok(!JSON.stringify(list.data).toLowerCase().includes('token'), "token javobda bo'lmasligi kerak");
    // Karta bilan obuna: Click (Merchant API → SHOP callback'lari) va Payme (receipts.create/pay → Merchant API)
    for (const [k, card] of [['project2', cc.data.cardId], ['project3', pc.data.id]]) {
      const c = await R.call('POST', '/portal/checkout', { items: [{ planPriceId: ids[`${k}Price`], quantity: 1 }], method: 'CARD', cardId: card });
      is(c, 201, `karta bilan checkout ${k}`); ok(c.data.status === 'PAID' && c.data.redirectUrl === null, `checkout: ${JSON.stringify(c.data)}`);
      await waitFulfilled(R, c.data.orderId);
    }
    const subs = await R.call('GET', '/portal/subscriptions');
    ok(subs.data.length === 3, `obunalar: ${subs.data.length}`);
    is(await R.call('POST', `/portal/cards/${cc.data.cardId}/remove`), 200, "kartani o'chirish");
    ok((await R.call('GET', '/portal/cards')).data.length === 1, "o'chirilgan karta ro'yxatda yo'q");
    return '2 ta karta, 2 ta karta bilan obuna';
  });
  await step('Audit jurnali yozilgan', async () => {
    const a = await S.call('GET', '/audit?pageSize=1');
    is(a, 200, 'audit'); ok(a.data.total >= 20, `${a.data.total} ta yozuv`);
    return `${a.data.total} ta yozuv`;
  });
  console.log(`\nNATIJA: ${passed} ta qadam muvaffaqiyatli ✓`);
} catch (e) {
  if (!(e instanceof SmokeFail)) console.error(e);
  if (apiLog.length) console.log('\n── API logi (oxirgi qatorlar) ──\n' + apiLog.join('').split('\n').slice(-40).join('\n'));
  console.log(`\nNATIJA: XATO (${passed} ta qadam o'tdi)`);
  process.exitCode = 1;
} finally {
  stopApi();
  fs.rmSync(storageDir, { recursive: true, force: true });
}
