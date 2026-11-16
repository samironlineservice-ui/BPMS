# Integrity test natijalari

> ADS-ERP arxitektura hujjatlari · [Hujjatlar indeksi](../../README.md) · [prisma-schema.md](prisma-schema.md) · [integrity.sql](integrity.sql)

## Xulosa
- **115 / 115 test o'tdi**, 0 ta xato.
- Muhit: Prisma CLI **7.10.1** (`validate`, `migrate diff`) → **PostgreSQL 18.6** (PGlite 0.5.16, WASM) → `integrity.sql` → testlar.
- Har test: `BEGIN` → amal → `SET CONSTRAINTS ALL IMMEDIATE` (deferred trigger'larni ham ishga tushiradi) → tekshiruv → `ROLLBACK`. Salbiy testlar aynan kutilgan constraint/trigger nomi bilan rad etilishi shart.
- **Drift tekshiruvi:** shu baza PGlite socket orqali ochilib, `prisma migrate diff --from-config-datasource --to-schema` ishga tushirildi → **bo'sh diff**. Ya'ni Prisma Migrate CHECK, EXCLUDE, trigger, RLS policy va partition'larni o'chirishga urinmaydi.

## Versiyalar
| Versiya | O'zgarish | Testlar |
|---|---|---|
| v1 | Asosiy model: IAM, CRM, billing, ledger, releases, deployments, RLS | 86 |
| v2 (2026-11-10) | Loyiha komponentlari, qurilma sinflari/egaligi (VPS, GPU, Raspberry Pi, ESP32), multi-instance, gateway-qurilma, agent self-update nishonlari, rahbar tasdig'i (`*:approve`), FX qayta baholash va oy yopilishi | +26 |
| v3 (2026-11-10) | Tasdiqlash siyosatida `approverPermission`: rahbar menejerga (doimiy yoki muddatli) ruxsat beradi, muddati tugagach tasdiqlay olmaydi | +3 |

## Tekshiruv paytida topilgan va tuzatilgan muammolar
| # | Muammo | Yechim |
|---|---|---|
| 1 | Partial index predikatidagi `IN (...)` ni PostgreSQL `= ANY (ARRAY[…])` ga aylantiradi → Prisma har migratsiyada 3 ta index uchun DROP/CREATE taklif qilardi (abadiy drift) | Predikatlar `OR`/`AND` zanjiriga o'tkazildi; qoida konvensiyalarga qo'shildi |
| 2 | Prisma 7.10 `migrate diff` `prisma.config.ts` da `datasource.url` bo'lmasa **xatosiz, lekin bo'sh** natija qaytaradi | Konvensiyaga qo'shildi; CI'da diff natijasi bo'sh emasligi alohida tekshiriladi |
| 3 | Rejadagi bir qatorli `enum X { A B }` qisqa yozuvi Prisma'da yaroqsiz | Haqiqiy schema'da har qiymat alohida qatorda (reja hujjatidagi qisqa yozuv faqat ko'rinish uchun) |
| 4 | Yangi topilma: bir nechta qoida bir vaqtda buzilganda PostgreSQL avval unique index'ni, keyin FK/EXCLUDE'ni tekshiradi | Testlar har qoidani alohida ajratib tekshiradigan qilib yozildi |

## Qamrov chegaralari (P0/P3 da yopiladi)
- PGlite bitta jarayonli — **parallel tranzaksiyalar** (bir invoice'ga ikki kassir, billing run poygasi, `FOR UPDATE SKIP LOCKED`, gapless raqamlash) bu yerda sinalmagan → Testcontainers + haqiqiy PostgreSQL bilan concurrency testlari (12.4 acceptance criteria).
- Rollar/RLS `SET LOCAL ROLE` bilan sinaldi; prod'dagi rol egaligi (`app_migrator` egasi, `app_rw` emas) infra skriptida tekshiriladi.

## Testlar ro'yxati
| # | Test | Natija | Bazaning javobi |
|---|---|---|---|
| 1 | users: email katta harf bilan rad etiladi | ✅ | new row for relation "users" violates check constraint "users_email_lower_ck" |
| 2 | roles: GLOBAL tayinlash dublikati rad etiladi | ✅ | duplicate key value violates unique constraint "user_role_assignments_global_uq" |
| 3 | roles: GLOBAL scope bilan scope_id rad etiladi | ✅ | new row for relation "user_role_assignments" violates check constraint "user_role_assignments_scope_ck" |
| 4 | roles: system rolini o'zgartirib bo'lmaydi | ✅ | append-only: UPDATE on roles is forbidden |
| 5 | sessions: realm va foydalanuvchi turi mos kelmasa rad etiladi | ✅ | new row for relation "sessions" violates check constraint "sessions_realm_ck" |
| 6 | approvals: so'rovchi o'z so'rovini tasdiqlay olmaydi (SoD) | ✅ | separation of duties: requester cannot decide own request 00000000-0000-4000-8000-000000000090 |
| 7 | approvals: boshqa xodim tasdiqlay oladi | ✅ | — |
| 8 | clients: Luhn'i noto'g'ri account_no rad etiladi | ✅ | new row for relation "clients" violates check constraint "clients_ck" |
| 9 | clients: faol mijozlar orasida STIR dublikati rad etiladi | ✅ | duplicate key value violates unique constraint "clients_tin_active_uq" |
| 10 | clients: arxivlangan (soft-deleted) mijoz STIR'i qayta ishlatilishi mumkin | ✅ | — |
| 11 | devices: boshqa mijozning filialiga bog'lab bo'lmaydi (composite FK) | ✅ | insert or update on table "devices" violates foreign key constraint "devices_site_id_client_id_fkey" |
| 12 | ads_luhn_ok: 79927398713 → true, 79927398710 → false | ✅ | {"ok":true} |
| 13 | subscriptions: bitta ClientProject'da ikkinchi tirik obuna rad etiladi | ✅ | duplicate key value violates unique constraint "subscriptions_one_live_uq" |
| 14 | subscriptions: boshqa mijozning ClientProject'iga bog'lab bo'lmaydi | ✅ | insert or update on table "subscriptions" violates foreign key constraint "subscriptions_client_project_id_client_id_fkey" |
| 15 | subscriptions: ruxsatsiz o'tish ACTIVE → TRIALING rad etiladi | ✅ | illegal subscription transition ACTIVE -> TRIALING |
| 16 | subscriptions: ruxsat etilgan o'tish ACTIVE → PAST_DUE | ✅ | — |
| 17 | subscriptions: valyutani o'zgartirib bo'lmaydi | ✅ | subscription 00000000-0000-4000-8000-000000000040 identity (client, client_project, currency) is immutable |
| 18 | subscriptions: o'chirib bo'lmaydi | ✅ | subscriptions are never deleted |
| 19 | revisions: vaqt oralig'i ustma-ust tushsa rad etiladi (EXCLUDE) | ✅ | duplicate key value violates unique constraint "subscription_revisions_one_open_uq" |
| 20 | revisions: yopiq, lekin ustma-ust tushadigan oraliq ham rad etiladi (EXCLUDE) | ✅ | conflicting key value violates exclusion constraint "subscription_revisions_no_overlap" |
| 21 | revisions: to'g'ri ketma-ketlik (eskisini yopish + yangisi) | ✅ | — |
| 22 | revisions: valid_to faqat bir marta yopiladi, boshqa maydon o'zgarmaydi | ✅ | revision 00000000-0000-4000-8000-000000000042: only closing valid_to once is allowed |
| 23 | revisions: valyutasi obunanikidan farq qilsa rad etiladi (composite FK) | ✅ | insert or update on table "subscription_revisions" violates foreign key constraint "subscription_revisions_subscription_id_currency_fkey" |
| 24 | plan_prices: bir valyutada narx davrlari ustma-ust tushsa rad etiladi | ✅ | conflicting key value violates exclusion constraint "plan_prices_no_overlap" |
| 25 | invoice_lines: qator hisob-kitobi noto'g'ri bo'lsa rad etiladi | ✅ | new row for relation "invoice_lines" violates check constraint "invoice_lines_math_ck" |
| 26 | invoice_lines: proration (11/30 kun) to'g'ri hisoblanadi | ✅ | — |
| 27 | invoices: finalizatsiyada jami qatorlarga mos kelmasa rad etiladi | ✅ | invoice 00000000-0000-4000-8000-000000000080 totals do not match its lines |
| 28 | invoices: to'g'ri finalizatsiya (raqam, sana, jami) | ✅ | {"ok":true} |
| 29 | invoices: yakunlangan invoice summasini o'zgartirib bo'lmaydi | ✅ | invoice 00000000-0000-4000-8000-000000000100 is finalized; use a credit note |
| 30 | invoices: yakunlangan invoice'ga qator qo'shib bo'lmaydi | ✅ | lines of invoice 00000000-0000-4000-8000-000000000100 are frozen |
| 31 | invoices: yakunlangan invoice'ni o'chirib bo'lmaydi | ✅ | finalized invoice 00000000-0000-4000-8000-000000000100 cannot be deleted |
| 32 | invoices: DRAFT invoice qatorlari bilan o'chiriladi (cascade) | ✅ | — |
| 33 | invoices: bir obuna-davr uchun ikkinchi RECURRING invoice rad etiladi (billing idempotency) | ✅ | duplicate key value violates unique constraint "invoices_one_recurring_per_period_uq" |
| 34 | invoices: boshqa mijozning obunasiga invoice bog'lab bo'lmaydi | ✅ | insert or update on table "invoices" violates foreign key constraint "invoices_subscription_id_client_id_currency_fkey" |
| 35 | invoices: USD invoice'da carrying value kursga mos kelmasa rad etiladi | ✅ | new row for relation "invoices" violates check constraint "invoices_final_ck" |
| 36 | payments: qo'lda to'lov tasdiqlovchisiz POSTED bo'lmaydi (four-eyes) | ✅ | new row for relation "payments" violates check constraint "payments_channel_ck" |
| 37 | payments: kirituvchi o'zi tasdiqlay olmaydi | ✅ | user 00000000-0000-4000-8000-000000000001 lacks payments:approve |
| 38 | payments: boshqa xodim tasdiqlaydi → POSTED | ✅ | {"ok":true} |
| 39 | payments: summani o'zgartirib bo'lmaydi | ✅ | illegal mutation of payment 00000000-0000-4000-8000-000000000110 |
| 40 | allocations: to'liq taqsimlash → invoice PAID | ✅ | {"ok":true} |
| 41 | allocations: qisman taqsimlash → OPEN, qoldiq to'g'ri | ✅ | {"ok":true} |
| 42 | allocations: to'lov summasidan ortiq taqsimlash rad etiladi | ✅ | new row for relation "payments" violates check constraint "payments_amounts_ck" |
| 43 | allocations: invoice summasidan ortiq taqsimlash rad etiladi | ✅ | new row for relation "invoices" violates check constraint "invoices_amounts_ck" |
| 44 | allocations: DRAFT invoice'ga taqsimlab bo'lmaydi | ✅ | invoice 00000000-0000-4000-8000-000000000080 is not allocatable |
| 45 | allocations: boshqa mijozning invoice'iga taqsimlab bo'lmaydi | ✅ | insert or update on table "allocations" violates foreign key constraint "allocations_invoice_id_client_id_invoice_currency_fkey" |
| 46 | allocations: o'zgartirib bo'lmaydi (append-only) | ✅ | append-only: UPDATE on allocations is forbidden |
| 47 | allocations: noto'liq reversal rad etiladi | ✅ | a reversal must exactly negate its original allocation |
| 48 | allocations: aniq reversal → invoice yana OPEN, to'lov bo'shaydi | ✅ | {"ok":true} |
| 49 | FX: $112 invoice (12 000) UZS'da 12 100 kursida to'landi → FX foyda 11 200 so'm | ✅ | {"ok":true} |
| 50 | FX: fx_diff noto'g'ri hisoblansa rad etiladi | ✅ | new row for relation "allocations" violates check constraint "allocations_ck" |
| 51 | FX: summa kursga mos kelmasa (tolerantlikdan ortiq) rad etiladi | ✅ | new row for relation "allocations" violates check constraint "allocations_ck" |
| 52 | credit_notes: o'zi tasdiqlagan credit note rad etiladi | ✅ | user 00000000-0000-4000-8000-000000000001 lacks credit_notes:approve |
| 53 | credit_notes: to'liq credit note → invoice PAID (credited) | ✅ | {"ok":true} |
| 54 | refunds: REQUESTED dan boshqa holatda yaratib bo'lmaydi | ✅ | refunds start as REQUESTED |
| 55 | refunds: taqsimlanmagan qoldiqdan ortiq refund rad etiladi | ✅ | new row for relation "payments" violates check constraint "payments_amounts_ck" |
| 56 | refunds: so'rovchi o'zi tasdiqlay olmaydi | ✅ | user 00000000-0000-4000-8000-000000000001 lacks refunds:approve |
| 57 | refunds: FAILED bo'lsa band qilingan summa qaytariladi | ✅ | {"ok":true} |
| 58 | payment_orders: Luhn'i noto'g'ri raqam rad etiladi | ✅ | new row for relation "payment_orders" violates check constraint "payment_orders_ck" |
| 59 | gateway: FIXED buyurtmada ikkinchi tirik tranzaksiya rad etiladi | ✅ | duplicate key value violates unique constraint "gateway_transactions_one_live_fixed_uq" |
| 60 | gateway: bir provider tranzaksiyasi ikki marta yozilmaydi (idempotency) | ✅ | duplicate key value violates unique constraint "gateway_transactions_provider_external_id_key" |
| 61 | gateway: CANCELLED → SUCCEEDED o'tishi rad etiladi | ✅ | illegal gateway transaction change 00000000-0000-4000-8000-000000000141 |
| 62 | gateway: capture → Payment (gateway metodi, darhol POSTED) | ✅ | — |
| 63 | ledger: balanslangan entry qabul qilinadi | ✅ | — |
| 64 | ledger: balanslanmagan entry rad etiladi (commit'da) | ✅ | journal entry 00000000-0000-4000-8000-000000000150 is unbalanced |
| 65 | ledger: qatorsiz entry rad etiladi | ✅ | journal entry 00000000-0000-4000-8000-000000000150 has fewer than 2 lines |
| 66 | ledger: yopilgan davrga (oktyabr) yozib bo'lmaydi | ✅ | financial period of 2026-10-15 is closed or not opened |
| 67 | ledger: ochilmagan davrga (dekabr) yozib bo'lmaydi | ✅ | financial period of 2026-12-01 is closed or not opened |
| 68 | ledger: journal qatorini o'zgartirib bo'lmaydi | ✅ | append-only: UPDATE on journal_lines is forbidden |
| 69 | fx_rates: kursni o'zgartirib bo'lmaydi | ✅ | append-only: UPDATE on fx_rates is forbidden |
| 70 | fx_rates: CBU kursini o'chirib bo'lmaydi | ✅ | append-only: DELETE on fx_rates is forbidden |
| 71 | deployments: imzolanmagan (DRAFT) relizni ishga tushirib bo'lmaydi | ✅ | deployment 00000000-0000-4000-8000-000000000160 requires a signed (READY/PUBLISHED) release |
| 72 | deployments: READY reliz bilan ishga tushadi | ✅ | — |
| 73 | deployment_targets: bitta o'rnatma bir vaqtda faqat bitta faol deploymentda | ✅ | duplicate key value violates unique constraint "deployment_targets_one_active_uq" |
| 74 | deployment_targets: boshqa deploymentning to'lqiniga bog'lab bo'lmaydi | ✅ | insert or update on table "deployment_targets" violates foreign key constraint "deployment_targets_wave_id_deployment_id_fkey" |
| 75 | releases: imzolangan relizga artefakt qo'shib bo'lmaydi | ✅ | artifacts of signed release 00000000-0000-4000-8000-000000000061 are immutable |
| 76 | releases: imzolangan relizning versiyasini o'zgartirib bo'lmaydi | ✅ | release 00000000-0000-4000-8000-000000000061 is signed; its core fields are immutable |
| 77 | releases: SemVer bo'lmagan versiya rad etiladi | ✅ | new row for relation "releases" violates check constraint "releases_ck" |
| 78 | releases: o'zi yaratgan relizni o'zi publish qila olmaydi (SoD) | ✅ | new row for relation "releases" violates check constraint "releases_ck" |
| 79 | audit_logs: partitioned jadval (default partition) | ✅ | {"ok":true} |
| 80 | audit_logs: yozuvni o'zgartirib bo'lmaydi | ✅ | append-only: UPDATE on audit_logs_default is forbidden |
| 81 | audit_logs: oylik partition yaratiladi va yozuvlar unga tushadi | ✅ | {"ok":true} |
| 82 | devices: CLIENT qurilma mijozsiz bo'lmaydi | ✅ | new row for relation "devices" violates check constraint "devices_ck" |
| 83 | devices: kompaniya VPS'i mijozga bog'lanmaydi | ✅ | new row for relation "devices" violates check constraint "devices_ck" |
| 84 | devices: ESP32'da Go agent rejimi rad etiladi | ✅ | new row for relation "devices" violates check constraint "devices_ck" |
| 85 | devices: GATEWAY_PROXIED gateway'siz rad etiladi | ✅ | new row for relation "devices" violates check constraint "devices_ck" |
| 86 | devices: ESP32 boshqa mijozning gateway'i orqali boshqarilmaydi | ✅ | gateway device 00000000-0000-4000-8000-000000000401 must be an AGENT device of the same client |
| 87 | devices: ESP32 o'z mijozining Raspberry Pi gateway'i orqali — OK | ✅ | — |
| 88 | devices: faol o'rnatmasi bor qurilma egasini o'zgartirib bo'lmaydi | ✅ | device 00000000-0000-4000-8000-000000000070 has active installations; ownership cannot change |
| 89 | installations: mijoz qurilmasida umumiy (mijozsiz) instans rad etiladi | ✅ | shared (client-less) installation is allowed only on COMPANY devices |
| 90 | installations: A mijoz qurilmasida B mijoz instansi rad etiladi | ✅ | installation client must match the owner of device 00000000-0000-4000-8000-000000000073 |
| 91 | installations: FIRMWARE komponent Windows serverga o'rnatilmaydi | ✅ | component runtime FIRMWARE is incompatible with device platform WINDOWS |
| 92 | installations: FIRMWARE komponent ESP32'ga — OK | ✅ | — |
| 93 | installations: server komponenti ESP32'ga o'rnatilmaydi | ✅ | component runtime SERVER_SERVICE is incompatible with device platform ESP_IDF |
| 94 | installations: kompaniya VPS'ida A va B mijoz instanslari + umumiy instans — OK | ✅ | {"ok":true} |
| 95 | installations: bitta qurilmada bir mijozning ikkinchi instansi rad etiladi | ✅ | duplicate key value violates unique constraint "device_installations_client_uq" |
| 96 | installations: boshqa komponentning relizini current qilib bo'lmaydi | ✅ | insert or update on table "device_installations" violates foreign key constraint "device_installations_current_release_id_component_id_fkey" |
| 97 | releases: turli komponentlarda bir xil versiya — OK, bitta komponentda dublikat — rad | ✅ | duplicate key value violates unique constraint "releases_component_id_version_key" |
| 98 | deployments: boshqa komponentning relizi bilan deployment rad etiladi | ✅ | insert or update on table "deployments" violates foreign key constraint "deployments_release_id_component_id_fkey" |
| 99 | deployment_targets: VPS'dagi A va B instanslari bir deploymentda parallel — OK | ✅ | — |
| 100 | deployment_targets: target qurilmasi o'rnatma qurilmasiga mos bo'lishi shart | ✅ | insert or update on table "deployment_targets" violates foreign key constraint "deployment_targets_installation_id_component_id_device_id_fkey" |
| 101 | agent self-update: bitta qurilmada bir vaqtda faqat bitta faol agent deploymenti | ✅ | duplicate key value violates unique constraint "deployment_targets_one_active_agent_uq" |
| 102 | payments: rahbar o'zi kiritgan to'lovni o'zi tasdiqlaydi — OK | ✅ | — |
| 103 | payments: ruxsati yo'q xodim (support) tasdiqlay olmaydi | ✅ | user 00000000-0000-4000-8000-000000000003 lacks payments:approve |
| 104 | payments: rahbar roli muddati tugagan bo'lsa tasdiqlay olmaydi | ✅ | user 00000000-0000-4000-8000-000000000002 lacks payments:approve |
| 105 | approvals: policy ruxsat bersa (allow_self_approval) rahbar o'z so'rovini tasdiqlaydi | ✅ | — |
| 106 | approvals: ruxsati yo'q xodim (menejer) prod deploymentni tasdiqlay olmaydi | ✅ | user 00000000-0000-4000-8000-000000000003 lacks the approver permission for request 00000000-0000-4000-8000-000000000092 |
| 107 | approvals: rahbar menejerga muddatli ruxsat bersa — menejer tasdiqlaydi | ✅ | — |
| 108 | approvals: delegatsiya muddati tugagach menejer tasdiqlay olmaydi | ✅ | user 00000000-0000-4000-8000-000000000003 lacks the approver permission for request 00000000-0000-4000-8000-000000000092 |
| 109 | FX qayta baholash: oy USD AR qayta baholanmaguncha yopilmaydi | ✅ | new row for relation "financial_periods" violates check constraint "financial_periods_ck" |
| 110 | FX qayta baholash: USD AR (0 sent, +UZS) ↔ 7150 entry balanslanadi va oy yopiladi | ✅ | — |
| 111 | RLS: portal faqat o'z mijozining invoice'larini ko'radi | ✅ | {"ok":true} |
| 112 | RLS: app.client_id o'rnatilmasa hech narsa ko'rinmaydi (fail closed) | ✅ | {"ok":true} |
| 113 | RLS: portal boshqa mijoz nomidan checkout buyurtmasi yarata olmaydi | ✅ | new row violates row-level security policy for table "payment_orders" |
| 114 | RLS: portal invoice'ni o'zgartira olmaydi (grant yo'q) | ✅ | permission denied for table invoices |
| 115 | RLS: portal boshqa loyihalar va tariflarni ko'rmaydi | ✅ | {"ok":true} |

## Ilova: tekshiruv skriptlari (P0'da Vitest + Testcontainers harness'ga ko'chiriladi)
<details><summary><code>run_tests.mjs</code> — DDL post-processing, fixture'lar va 115 ta test</summary>

```js
// Constraint test suite: Prisma DDL + integrity.sql → PGlite (real PostgreSQL) → har qoidani buzishga urinish.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const luhn = (base) => {
  let sum = 0;
  const d = base.split('').map(Number);
  for (let i = 0; i < d.length; i++) {
    let x = d[d.length - 1 - i];
    if (i % 2 === 0) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
  }
  return base + ((10 - (sum % 10)) % 10);
};

// ── DDL post-processing: 4 jadval → PARTITION BY RANGE ──
let ddl = fs.readFileSync('ddl.sql', 'utf8');
for (const [t, k] of Object.entries({ audit_logs: 'occurred_at', device_events: 'occurred_at',
  deployment_target_events: 'received_at', gateway_events: 'received_at' })) {
  const re = new RegExp(`(CREATE TABLE "${t}" \\([\\s\\S]*?\\n)\\);`);
  if (!re.test(ddl)) throw new Error('table not found: ' + t);
  ddl = ddl.replace(re, `$1) PARTITION BY RANGE ("${k}");`);
}
const integrity = fs.readFileSync('integrity.sql', 'utf8');

const db = await PGlite.create({ extensions: { btree_gist, pg_trgm } });
console.log((await db.query('select version()')).rows[0].version);
await db.exec(`CREATE ROLE app_rw; CREATE ROLE app_portal; CREATE ROLE app_readonly;`);
await db.exec(`CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
await db.exec(ddl);
await db.exec(integrity);
console.log('schema + integrity.sql applied OK');

// ── Fixtures (commit) ──
const [U1, U2, U3] = [id(1), id(2), id(3)];
const [CA, CB] = [id(10), id(11)], [SA, SB] = [id(12), id(13)];
const P1 = id(20), [CPA, CPB] = [id(21), id(22)];
const PLAN = id(30), [PP_UZS, PP_USD] = [id(31), id(32)];
const [SUB_A, SUB_B] = [id(40), id(41)], [REV_A, REV_B] = [id(42), id(43)];
const [FX1, FX2] = [id(50), id(51)];
const [R_DRAFT, R_READY] = [id(60), id(61)], FILE1 = id(62);
const DEV_A = id(70), VPS1 = id(71), ESP_A = id(72), GW_A = id(73), INST_A = id(74);
const ROLE_DIR = id(5), [COMP_SRV, COMP_FW, COMP_WEB] = [id(23), id(24), id(25)], [P_AGENT, COMP_AGENT] = [id(26), id(27)];
const [INV_A_DRAFT, INV_B_DRAFT] = [id(80), id(81)];
const POL = 'payments.refund', AREQ = id(90);
const ACC_A = luhn('1000001'), ACC_B = luhn('1000002');
const NOW = `now()`;

await db.exec(`
INSERT INTO users (id, email, full_name, updated_at) VALUES
  ('${U1}','u1@ads.uz','Buxgalter',${NOW}), ('${U2}','u2@ads.uz','Rahbar',${NOW}), ('${U3}','u3@ads.uz','Support',${NOW});
UPDATE users SET status='ACTIVE';
INSERT INTO permissions (key, module, description, sensitive) VALUES
  ('deployments:approve','deployments','Prod deploymentni tasdiqlash',true),
  ('payments:approve','billing','Qo''lda to''lovni tasdiqlash',true),
  ('refunds:approve','billing','Refundni tasdiqlash',true),
  ('credit_notes:approve','billing','Credit note tasdiqlash',true);
INSERT INTO roles (id, key, name, is_system, updated_at) VALUES ('${ROLE_DIR}','director','Rahbar',true,now());
INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('${ROLE_DIR}','payments:approve'), ('${ROLE_DIR}','refunds:approve'), ('${ROLE_DIR}','credit_notes:approve'),
  ('${ROLE_DIR}','deployments:approve');
INSERT INTO user_role_assignments (id, user_id, role_id) VALUES (gen_random_uuid(),'${U2}','${ROLE_DIR}');
INSERT INTO clients (id, code, type, legal_name, display_name, account_no, tin, updated_at) VALUES
  ('${CA}','CL-000001','COMPANY','A MChJ','A','${ACC_A}','123456789',${NOW}),
  ('${CB}','CL-000002','COMPANY','B MChJ','B','${ACC_B}','987654321',${NOW});
INSERT INTO client_sites (id, client_id, name, updated_at) VALUES ('${SA}','${CA}','Bosh ofis',${NOW}), ('${SB}','${CB}','Filial',${NOW});
INSERT INTO projects (id, code, name, updated_at) VALUES ('${P1}','pos-retail','POS Retail',${NOW});
INSERT INTO projects (id, code, name, is_internal, updated_at) VALUES ('${P_AGENT}','ads-agent','ADS Agent',true,${NOW});
INSERT INTO project_components (id, project_id, key, name, runtime, updated_at) VALUES
  ('${COMP_SRV}','${P1}','pos-server','POS server','SERVER_SERVICE',${NOW}),
  ('${COMP_FW}','${P1}','sensor-fw','Sensor firmware','FIRMWARE',${NOW}),
  ('${COMP_WEB}','${P1}','pos-web','POS web','STATIC_WEB',${NOW}),
  ('${COMP_AGENT}','${P_AGENT}','agent','Go agent','SERVER_SERVICE',${NOW});
INSERT INTO client_projects (id, client_id, project_id, updated_at) VALUES ('${CPA}','${CA}','${P1}',${NOW}), ('${CPB}','${CB}','${P1}',${NOW});
INSERT INTO plans (id, project_id, code, name, updated_at) VALUES ('${PLAN}','${P1}','std','Standart',${NOW});
INSERT INTO plan_prices (id, plan_id, currency, unit_amount_minor, vat_rate_bp, valid_from, created_by_id) VALUES
  ('${PP_UZS}','${PLAN}','UZS',100000000,1200,'2026-01-01','${U1}'),
  ('${PP_USD}','${PLAN}','USD',10000,1200,'2026-01-01','${U1}');
INSERT INTO financial_periods (month, fx_revalued_at, closed_at) VALUES ('2026-10-01', now() - interval '1 minute', now()), ('2026-11-01', NULL, NULL);
INSERT INTO fx_rates (id, source, base, quote, effective_date, rate) VALUES
  ('${FX1}','CBU','USD','UZS','2026-11-01',12000), ('${FX2}','CBU','USD','UZS','2026-11-10',12100);
INSERT INTO subscriptions (id, code, client_id, client_project_id, currency, status, updated_at) VALUES
  ('${SUB_A}','SUB-000001','${CA}','${CPA}','UZS','ACTIVE',${NOW}),
  ('${SUB_B}','SUB-000002','${CB}','${CPB}','USD','ACTIVE',${NOW});
INSERT INTO subscription_revisions (id, subscription_id, revision_no, currency, valid_from, status, mrr_minor, change_type) VALUES
  ('${REV_A}','${SUB_A}',1,'UZS','2026-11-01','ACTIVE',100000000,'CREATED'),
  ('${REV_B}','${SUB_B}',1,'USD','2026-11-01','ACTIVE',10000,'CREATED');
INSERT INTO ledger_accounts (code, name, type) VALUES
  ('1020','Bank','ASSET'),('1150','Clearing Payme','ASSET'),('1200','AR','ASSET'),('2100','Avanslar','LIABILITY'),
  ('2200','QQS','LIABILITY'),('4000','Daromad','REVENUE'),('7100','FX foyda','REVENUE'),('7200','FX zarar','EXPENSE'),
  ('7150','FX foyda (unrealized)','REVENUE'),('7250','FX zarar (unrealized)','EXPENSE');
INSERT INTO approval_policies (key, description, approver_permission, updated_at) VALUES
  ('${POL}','Refund','refunds:approve', ${NOW}), ('deployments.production','Prod deployment','deployments:approve', ${NOW});
INSERT INTO approval_requests (id, policy_key, resource_type, payload, payload_hash, requested_by_id, expires_at, updated_at)
  VALUES ('${AREQ}','${POL}','payment','{}','h','${U1}', now() + interval '1 day', ${NOW});
INSERT INTO files (id, storage_key, bucket, original_name, mime_type, size_bytes, uploaded_by_type, status, updated_at)
  VALUES ('${FILE1}','f/1','b','a.zip','application/zip',10,'STAFF','AVAILABLE',${NOW});
INSERT INTO releases (id, project_id, component_id, version, major, minor, patch, version_code, status, release_notes, created_by_id, tuf_role_version, updated_at) VALUES
  ('${R_DRAFT}','${P1}','${COMP_SRV}','1.1.0',1,1,0,10100,'DRAFT','{}','${U1}',NULL,${NOW}),
  ('${R_READY}','${P1}','${COMP_SRV}','1.0.0',1,0,0,10000,'READY','{}','${U1}',1,${NOW});
INSERT INTO devices (id, code, owner_type, client_id, site_id, device_class, management_mode, gateway_device_id, name, platform, arch, updated_at) VALUES
  ('${DEV_A}','DV-000001','CLIENT','${CA}','${SA}','SERVER','AGENT',NULL,'KASSA-01','WINDOWS','X64',${NOW}),
  ('${VPS1}','DV-000002','COMPANY',NULL,NULL,'VPS','AGENT',NULL,'vps-1','LINUX','X64',${NOW}),
  ('${GW_A}','DV-000003','CLIENT','${CA}','${SA}','EDGE_SBC','AGENT',NULL,'rpi-gw','LINUX','ARM64',${NOW}),
  ('${ESP_A}','DV-000004','CLIENT','${CA}','${SA}','MICROCONTROLLER','FIRMWARE_OTA',NULL,'sensor-1','ESP_IDF','XTENSA',${NOW});
INSERT INTO device_installations (id, device_id, component_id, project_id, client_id, client_project_id, updated_at)
  VALUES ('${INST_A}','${DEV_A}','${COMP_SRV}','${P1}','${CA}','${CPA}',${NOW});
INSERT INTO invoices (id, kind, client_id, currency, updated_at) VALUES
  ('${INV_A_DRAFT}','ONE_TIME','${CA}','UZS',${NOW}), ('${INV_B_DRAFT}','ONE_TIME','${CB}','UZS',${NOW});
`);
console.log('fixtures OK\n');

// ── Test helpers ──
let pass = 0, fail = 0;
const results = [];
async function check(name, sql, expectErr, assertSql) {
  await db.exec('BEGIN');
  let err = null, assertOk = true, got;
  try {
    await db.exec(sql);
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
    if (assertSql) { got = (await db.query(assertSql)).rows[0]; assertOk = got && got.ok === true; }
  } catch (e) { err = e; }
  try { await db.exec('ROLLBACK'); } catch {}
  const ok = expectErr ? !!err && expectErr.test(err.message) : !err && assertOk;
  ok ? pass++ : fail++;
  const detail = err ? err.message.split('\n')[0] : (assertSql ? JSON.stringify(got) : '');
  results.push({ ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
}

// Finalizatsiya qilingan UZS invoice (1 qator: 1 000 000 so'm + 12% QQS)
const finalizedInvoice = (inv, client = CA, sub = 'NULL', kind = 'ONE_TIME', period = ['NULL', 'NULL']) => `
INSERT INTO invoices (id, kind, client_id, subscription_id, currency, period_start, period_end, updated_at)
  VALUES ('${inv}','${kind}','${client}',${sub},'UZS',${period[0]},${period[1]},now());
INSERT INTO invoice_lines (id, invoice_id, position, type, description, quantity, unit_amount_minor, amount_minor, vat_rate_bp, vat_minor)
  VALUES (gen_random_uuid(),'${inv}',1,'SUBSCRIPTION','Obuna',1,100000000,100000000,1200,12000000);
UPDATE invoices SET status='OPEN', number='INV-T-${inv.slice(-4)}', issue_date='2026-11-10', due_date='2026-11-20',
  subtotal_minor=100000000, vat_minor=12000000, total_minor=112000000, total_uzs_minor=112000000, finalized_at=now()
  WHERE id='${inv}';`;
const postedPayment = (pay, amount, client = CA, currency = 'UZS', fx = 1) => `
INSERT INTO payments (id, code, client_id, method, status, currency, amount_minor, fx_rate, amount_uzs_minor, received_at, created_by_id)
  VALUES ('${pay}','PAY-${pay.slice(-4)}','${client}','BANK_TRANSFER','PENDING_APPROVAL','${currency}',${amount},${fx},round(${amount}*${fx}),now(),'${U1}');
UPDATE payments SET status='POSTED', approved_by_id='${U2}' WHERE id='${pay}';`;
const I1 = id(100), I2 = id(101), PAY1 = id(110), PAY2 = id(111);

// ── IAM / Approvals ──
await check('users: email katta harf bilan rad etiladi',
  `INSERT INTO users (id,email,full_name,updated_at) VALUES (gen_random_uuid(),'Ali@ads.uz','x',now())`, /users_email_lower_ck/);
await check('roles: GLOBAL tayinlash dublikati rad etiladi', `
  INSERT INTO roles (id,key,name,updated_at) VALUES ('${id(200)}','admin','Admin',now());
  INSERT INTO user_role_assignments (id,user_id,role_id) VALUES (gen_random_uuid(),'${U1}','${id(200)}');
  INSERT INTO user_role_assignments (id,user_id,role_id) VALUES (gen_random_uuid(),'${U1}','${id(200)}');`, /user_role_assignments_global_uq/);
await check('roles: GLOBAL scope bilan scope_id rad etiladi', `
  INSERT INTO roles (id,key,name,updated_at) VALUES ('${id(200)}','admin','Admin',now());
  INSERT INTO user_role_assignments (id,user_id,role_id,scope_type,scope_id) VALUES (gen_random_uuid(),'${U1}','${id(200)}','GLOBAL','${P1}');`, /scope_ck/);
await check('roles: system rolini o\'zgartirib bo\'lmaydi', `
  INSERT INTO roles (id,key,name,is_system,updated_at) VALUES ('${id(201)}','super_admin','SA',true,now());
  UPDATE roles SET name='hacked' WHERE id='${id(201)}';`, /append-only/);
await check('sessions: realm va foydalanuvchi turi mos kelmasa rad etiladi', `
  INSERT INTO sessions (id,realm,user_id,token_hash,idle_expires_at,absolute_expires_at)
  VALUES (gen_random_uuid(),'PORTAL','${U1}','t',now(),now()+interval '1h')`, /sessions_realm_ck/);
await check('approvals: so\'rovchi o\'z so\'rovini tasdiqlay olmaydi (SoD)',
  `INSERT INTO approval_decisions (id,request_id,approver_id,approve) VALUES (gen_random_uuid(),'${AREQ}','${U1}',true)`, /separation of duties/);
await check('approvals: boshqa xodim tasdiqlay oladi',
  `INSERT INTO approval_decisions (id,request_id,approver_id,approve) VALUES (gen_random_uuid(),'${AREQ}','${U2}',true)`, null);

// ── CRM ──
await check('clients: Luhn\'i noto\'g\'ri account_no rad etiladi', `
  INSERT INTO clients (id,code,type,legal_name,display_name,account_no,updated_at)
  VALUES (gen_random_uuid(),'CL-9','COMPANY','X','X','${ACC_A.slice(0, 7)}${(+ACC_A[7] + 1) % 10}',now())`, /clients_ck/);
await check('clients: faol mijozlar orasida STIR dublikati rad etiladi', `
  INSERT INTO clients (id,code,type,legal_name,display_name,account_no,tin,updated_at)
  VALUES (gen_random_uuid(),'CL-9','COMPANY','X','X','${luhn('1000009')}','123456789',now())`, /clients_tin_active_uq/);
await check('clients: arxivlangan (soft-deleted) mijoz STIR\'i qayta ishlatilishi mumkin', `
  UPDATE clients SET deleted_at=now() WHERE id='${CA}';
  INSERT INTO clients (id,code,type,legal_name,display_name,account_no,tin,updated_at)
  VALUES (gen_random_uuid(),'CL-9','COMPANY','X','X','${luhn('1000009')}','123456789',now())`, null);
await check('devices: boshqa mijozning filialiga bog\'lab bo\'lmaydi (composite FK)', `
  INSERT INTO devices (id,code,client_id,site_id,device_class,name,platform,arch,updated_at)
  VALUES (gen_random_uuid(),'DV-9','${CA}','${SB}','SERVER','X','LINUX','X64',now())`, /foreign key/);
await check('ads_luhn_ok: 79927398713 → true, 79927398710 → false', `SELECT 1`, null,
  `SELECT ads_luhn_ok('79927398713') AND NOT ads_luhn_ok('79927398710') AS ok`);

// ── Obunalar ──
await check('subscriptions: bitta ClientProject\'da ikkinchi tirik obuna rad etiladi', `
  INSERT INTO subscriptions (id,code,client_id,client_project_id,currency,status,updated_at)
  VALUES (gen_random_uuid(),'SUB-9','${CA}','${CPA}','UZS','ACTIVE',now())`, /subscriptions_one_live_uq/);
await check('subscriptions: boshqa mijozning ClientProject\'iga bog\'lab bo\'lmaydi', `
  INSERT INTO subscriptions (id,code,client_id,client_project_id,currency,status,ended_at,updated_at)
  VALUES (gen_random_uuid(),'SUB-9','${CA}','${CPB}','UZS','CANCELLED',now(),now())`, /foreign key/);
await check('subscriptions: ruxsatsiz o\'tish ACTIVE → TRIALING rad etiladi',
  `UPDATE subscriptions SET status='TRIALING', trial_ends_on='2026-12-01' WHERE id='${SUB_A}'`, /illegal subscription transition/);
await check('subscriptions: ruxsat etilgan o\'tish ACTIVE → PAST_DUE',
  `UPDATE subscriptions SET status='PAST_DUE', past_due_since='2026-11-21' WHERE id='${SUB_A}'`, null);
await check('subscriptions: valyutani o\'zgartirib bo\'lmaydi',
  `UPDATE subscriptions SET currency='USD' WHERE id='${SUB_A}'`, /identity/);
await check('subscriptions: o\'chirib bo\'lmaydi', `DELETE FROM subscriptions WHERE id='${SUB_A}'`, /never deleted/);
await check('revisions: vaqt oralig\'i ustma-ust tushsa rad etiladi (EXCLUDE)', `
  INSERT INTO subscription_revisions (id,subscription_id,revision_no,currency,valid_from,status,mrr_minor,change_type)
  VALUES (gen_random_uuid(),'${SUB_A}',2,'UZS','2026-11-15','ACTIVE',1,'QUANTITY_CHANGE')`, /no_overlap|one_open_uq/);
await check('revisions: yopiq, lekin ustma-ust tushadigan oraliq ham rad etiladi (EXCLUDE)', `
  INSERT INTO subscription_revisions (id,subscription_id,revision_no,currency,valid_from,valid_to,status,mrr_minor,change_type)
  VALUES (gen_random_uuid(),'${SUB_A}',2,'UZS','2026-11-15','2026-11-20','ACTIVE',1,'QUANTITY_CHANGE')`, /subscription_revisions_no_overlap/);
await check('revisions: to\'g\'ri ketma-ketlik (eskisini yopish + yangisi)', `
  UPDATE subscription_revisions SET valid_to='2026-11-15' WHERE id='${REV_A}';
  INSERT INTO subscription_revisions (id,subscription_id,revision_no,currency,valid_from,status,mrr_minor,change_type)
  VALUES (gen_random_uuid(),'${SUB_A}',2,'UZS','2026-11-15','ACTIVE',200000000,'QUANTITY_CHANGE')`, null);
await check('revisions: valid_to faqat bir marta yopiladi, boshqa maydon o\'zgarmaydi', `
  UPDATE subscription_revisions SET valid_to='2026-11-15' WHERE id='${REV_A}';
  UPDATE subscription_revisions SET valid_to='2026-11-20' WHERE id='${REV_A}';`, /only closing valid_to once/);
await check('revisions: valyutasi obunanikidan farq qilsa rad etiladi (composite FK)', `
  UPDATE subscription_revisions SET valid_to='2026-11-15' WHERE id='${REV_A}';
  INSERT INTO subscription_revisions (id,subscription_id,revision_no,currency,valid_from,status,mrr_minor,change_type)
  VALUES (gen_random_uuid(),'${SUB_A}',2,'USD','2026-11-15','ACTIVE',1,'PRICE_CHANGE')`, /foreign key/);
await check('plan_prices: bir valyutada narx davrlari ustma-ust tushsa rad etiladi', `
  INSERT INTO plan_prices (id,plan_id,currency,unit_amount_minor,vat_rate_bp,valid_from,created_by_id)
  VALUES (gen_random_uuid(),'${PLAN}','UZS',1,1200,'2026-06-01','${U1}')`, /plan_prices_no_overlap/);

// ── Invoice'lar ──
await check('invoice_lines: qator hisob-kitobi noto\'g\'ri bo\'lsa rad etiladi', `
  INSERT INTO invoice_lines (id,invoice_id,position,type,description,quantity,unit_amount_minor,amount_minor,vat_rate_bp,vat_minor)
  VALUES (gen_random_uuid(),'${INV_A_DRAFT}',1,'ONE_TIME','x',2,100,201,0,0)`, /invoice_lines_math_ck/);
await check('invoice_lines: proration (11/30 kun) to\'g\'ri hisoblanadi', `
  INSERT INTO invoice_lines (id,invoice_id,position,type,description,quantity,unit_amount_minor,proration_num,proration_den,amount_minor,vat_rate_bp,vat_minor)
  VALUES (gen_random_uuid(),'${INV_A_DRAFT}',1,'PRORATION','x',1,100000000,11,30,36666667,1200,4400000)`, null);
await check('invoices: finalizatsiyada jami qatorlarga mos kelmasa rad etiladi', `
  INSERT INTO invoice_lines (id,invoice_id,position,type,description,quantity,unit_amount_minor,amount_minor,vat_rate_bp,vat_minor)
  VALUES (gen_random_uuid(),'${INV_A_DRAFT}',1,'ONE_TIME','x',1,100,100,0,0);
  UPDATE invoices SET status='OPEN', number='INV-X', issue_date='2026-11-10', due_date='2026-11-20',
    subtotal_minor=999, vat_minor=0, total_minor=999, total_uzs_minor=999, finalized_at=now() WHERE id='${INV_A_DRAFT}'`, /totals do not match/);
await check('invoices: to\'g\'ri finalizatsiya (raqam, sana, jami)', finalizedInvoice(I1), null,
  `SELECT status='OPEN' AS ok FROM invoices WHERE id='${I1}'`);
await check('invoices: yakunlangan invoice summasini o\'zgartirib bo\'lmaydi',
  finalizedInvoice(I1) + `UPDATE invoices SET total_minor=1, subtotal_minor=1, vat_minor=0 WHERE id='${I1}'`, /finalized; use a credit note/);
await check('invoices: yakunlangan invoice\'ga qator qo\'shib bo\'lmaydi', finalizedInvoice(I1) + `
  INSERT INTO invoice_lines (id,invoice_id,position,type,description,quantity,unit_amount_minor,amount_minor,vat_rate_bp,vat_minor)
  VALUES (gen_random_uuid(),'${I1}',2,'ONE_TIME','x',1,1,1,0,0)`, /frozen/);
await check('invoices: yakunlangan invoice\'ni o\'chirib bo\'lmaydi', finalizedInvoice(I1) + `DELETE FROM invoices WHERE id='${I1}'`, /cannot be deleted/);
await check('invoices: DRAFT invoice qatorlari bilan o\'chiriladi (cascade)', `
  INSERT INTO invoice_lines (id,invoice_id,position,type,description,quantity,unit_amount_minor,amount_minor,vat_rate_bp,vat_minor)
  VALUES (gen_random_uuid(),'${INV_A_DRAFT}',1,'ONE_TIME','x',1,100,100,0,0);
  DELETE FROM invoices WHERE id='${INV_A_DRAFT}'`, null);
await check('invoices: bir obuna-davr uchun ikkinchi RECURRING invoice rad etiladi (billing idempotency)', `
  INSERT INTO invoices (id,kind,client_id,subscription_id,currency,period_start,period_end,updated_at)
  VALUES (gen_random_uuid(),'RECURRING','${CA}','${SUB_A}','UZS','2026-12-01','2027-01-01',now()),
         (gen_random_uuid(),'RECURRING','${CA}','${SUB_A}','UZS','2026-12-01','2027-01-01',now())`, /invoices_one_recurring_per_period_uq/);
await check('invoices: boshqa mijozning obunasiga invoice bog\'lab bo\'lmaydi', `
  INSERT INTO invoices (id,kind,client_id,subscription_id,currency,period_start,period_end,updated_at)
  VALUES (gen_random_uuid(),'RECURRING','${CA}','${SUB_B}','UZS','2026-12-01','2027-01-01',now())`, /foreign key/);
await check('invoices: USD invoice\'da carrying value kursga mos kelmasa rad etiladi', `
  INSERT INTO invoices (id,kind,client_id,currency,updated_at) VALUES ('${I2}','ONE_TIME','${CB}','USD',now());
  INSERT INTO invoice_lines (id,invoice_id,position,type,description,quantity,unit_amount_minor,amount_minor,vat_rate_bp,vat_minor)
  VALUES (gen_random_uuid(),'${I2}',1,'ONE_TIME','x',1,10000,10000,1200,1200);
  UPDATE invoices SET status='OPEN', number='INV-USD', issue_date='2026-11-01', due_date='2026-11-11', fx_rate_id='${FX1}', fx_rate=12000,
    subtotal_minor=10000, vat_minor=1200, total_minor=11200, total_uzs_minor=1, finalized_at=now() WHERE id='${I2}'`, /invoices_final_ck/);

// ── To'lovlar va taqsimlash ──
await check('payments: qo\'lda to\'lov tasdiqlovchisiz POSTED bo\'lmaydi (four-eyes)', `
  INSERT INTO payments (id,code,client_id,method,status,currency,amount_minor,amount_uzs_minor,received_at,created_by_id)
  VALUES (gen_random_uuid(),'PAY-X','${CA}','CASH','POSTED','UZS',100,100,now(),'${U1}')`, /payments_channel_ck/);
await check('payments: kirituvchi o\'zi tasdiqlay olmaydi', `
  INSERT INTO payments (id,code,client_id,method,status,currency,amount_minor,amount_uzs_minor,received_at,created_by_id)
  VALUES ('${PAY1}','PAY-X','${CA}','CASH','PENDING_APPROVAL','UZS',100,100,now(),'${U1}');
  UPDATE payments SET status='POSTED', approved_by_id='${U1}' WHERE id='${PAY1}'`, /lacks payments:approve/);
await check('payments: boshqa xodim tasdiqlaydi → POSTED', postedPayment(PAY1, 112000000), null,
  `SELECT status='POSTED' AS ok FROM payments WHERE id='${PAY1}'`);
await check('payments: summani o\'zgartirib bo\'lmaydi', postedPayment(PAY1, 112000000) +
  `UPDATE payments SET amount_minor=1, amount_uzs_minor=1 WHERE id='${PAY1}'`, /illegal mutation of payment/);
await check('allocations: to\'liq taqsimlash → invoice PAID', finalizedInvoice(I1) + postedPayment(PAY1, 112000000) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES ('${id(120)}','${CA}','${PAY1}','UZS','${I1}','UZS',112000000,112000000,1,112000000,112000000,0,now())`, null,
  `SELECT (SELECT status FROM invoices WHERE id='${I1}')='PAID' AND (SELECT allocated_minor FROM payments WHERE id='${PAY1}')=112000000 AS ok`);
await check('allocations: qisman taqsimlash → OPEN, qoldiq to\'g\'ri', finalizedInvoice(I1) + postedPayment(PAY1, 50000000) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CA}','${PAY1}','UZS','${I1}','UZS',50000000,50000000,1,50000000,50000000,0,now())`, null,
  `SELECT status='OPEN' AND total_minor-paid_minor=62000000 AS ok FROM invoices WHERE id='${I1}'`);
await check('allocations: to\'lov summasidan ortiq taqsimlash rad etiladi', finalizedInvoice(I1) + postedPayment(PAY1, 1000) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CA}','${PAY1}','UZS','${I1}','UZS',2000,2000,1,2000,2000,0,now())`, /payments_amounts_ck/);
await check('allocations: invoice summasidan ortiq taqsimlash rad etiladi', finalizedInvoice(I1) + postedPayment(PAY1, 200000000) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CA}','${PAY1}','UZS','${I1}','UZS',150000000,150000000,1,150000000,150000000,0,now())`, /invoices_amounts_ck/);
await check('allocations: DRAFT invoice\'ga taqsimlab bo\'lmaydi', postedPayment(PAY1, 1000) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CA}','${PAY1}','UZS','${INV_A_DRAFT}','UZS',100,100,1,100,100,0,now())`, /not allocatable/);
await check('allocations: boshqa mijozning invoice\'iga taqsimlab bo\'lmaydi', finalizedInvoice(I1) + postedPayment(PAY1, 1000, CB) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CB}','${PAY1}','UZS','${I1}','UZS',100,100,1,100,100,0,now())`, /foreign key/);
const fullAlloc = finalizedInvoice(I1) + postedPayment(PAY1, 112000000) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES ('${id(120)}','${CA}','${PAY1}','UZS','${I1}','UZS',112000000,112000000,1,112000000,112000000,0,now());`;
await check('allocations: o\'zgartirib bo\'lmaydi (append-only)', fullAlloc + `UPDATE allocations SET applied_at=now() WHERE id='${id(120)}'`, /append-only/);
await check('allocations: noto\'liq reversal rad etiladi', fullAlloc + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at,reversal_of_id)
  VALUES (gen_random_uuid(),'${CA}','${PAY1}','UZS','${I1}','UZS',-100,-100,1,-100,-100,0,now(),'${id(120)}')`, /exactly negate/);
await check('allocations: aniq reversal → invoice yana OPEN, to\'lov bo\'shaydi', fullAlloc + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at,reversal_of_id)
  VALUES (gen_random_uuid(),'${CA}','${PAY1}','UZS','${I1}','UZS',-112000000,-112000000,1,-112000000,-112000000,0,now(),'${id(120)}')`, null,
  `SELECT (SELECT status FROM invoices WHERE id='${I1}')='OPEN' AND (SELECT allocated_minor FROM payments WHERE id='${PAY1}')=0 AS ok`);
const usdInvoice = `
  INSERT INTO invoices (id,kind,client_id,currency,updated_at) VALUES ('${I2}','ONE_TIME','${CB}','USD',now());
  INSERT INTO invoice_lines (id,invoice_id,position,type,description,quantity,unit_amount_minor,amount_minor,vat_rate_bp,vat_minor)
  VALUES (gen_random_uuid(),'${I2}',1,'ONE_TIME','x',1,10000,10000,1200,1200);
  UPDATE invoices SET status='OPEN', number='INV-USD', issue_date='2026-11-01', due_date='2026-11-11', fx_rate_id='${FX1}', fx_rate=12000,
    subtotal_minor=10000, vat_minor=1200, total_minor=11200, total_uzs_minor=134400000, finalized_at=now() WHERE id='${I2}';`;
await check('FX: $112 invoice (12 000) UZS\'da 12 100 kursida to\'landi → FX foyda 11 200 so\'m', usdInvoice + postedPayment(PAY2, 135520000, CB) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate_id,fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CB}','${PAY2}','UZS','${I2}','USD',135520000,11200,'${FX2}',12100,135520000,134400000,1120000,now())`, null,
  `SELECT status='PAID' AS ok FROM invoices WHERE id='${I2}'`);
await check('FX: fx_diff noto\'g\'ri hisoblansa rad etiladi', usdInvoice + postedPayment(PAY2, 135520000, CB) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CB}','${PAY2}','UZS','${I2}','USD',135520000,11200,12100,135520000,134400000,999,now())`, /allocations_ck/);
await check('FX: summa kursga mos kelmasa (tolerantlikdan ortiq) rad etiladi', usdInvoice + postedPayment(PAY2, 135520000, CB) + `
  INSERT INTO allocations (id,client_id,payment_id,payment_currency,invoice_id,invoice_currency,amount_payment_minor,amount_invoice_minor,
    fx_rate,settled_uzs_minor,carrying_uzs_minor,fx_diff_uzs_minor,applied_at)
  VALUES (gen_random_uuid(),'${CB}','${PAY2}','UZS','${I2}','USD',135520000,11000,12100,135520000,134400000,1120000,now())`, /allocations_ck/);

// ── Credit note va refund ──
await check('credit_notes: o\'zi tasdiqlagan credit note rad etiladi', finalizedInvoice(I1) + `
  INSERT INTO credit_notes (id,number,invoice_id,client_id,currency,amount_minor,vat_minor,reason,issued_at,created_by_id,approved_by_id)
  VALUES (gen_random_uuid(),'CN-1','${I1}','${CA}','UZS',1000,0,'x',now(),'${U1}','${U1}')`, /lacks credit_notes:approve/);
await check('credit_notes: to\'liq credit note → invoice PAID (credited)', finalizedInvoice(I1) + `
  INSERT INTO credit_notes (id,number,invoice_id,client_id,currency,amount_minor,vat_minor,reason,issued_at,created_by_id,approved_by_id)
  VALUES (gen_random_uuid(),'CN-1','${I1}','${CA}','UZS',112000000,12000000,'x',now(),'${U1}','${U2}')`, null,
  `SELECT status='PAID' AND credited_minor=112000000 AS ok FROM invoices WHERE id='${I1}'`);
await check('refunds: REQUESTED dan boshqa holatda yaratib bo\'lmaydi', postedPayment(PAY1, 1000) + `
  INSERT INTO refunds (id,payment_id,amount_minor,status,reason,requested_by_id,approved_by_id)
  VALUES (gen_random_uuid(),'${PAY1}',100,'APPROVED','x','${U1}','${U2}')`, /start as REQUESTED/);
await check('refunds: taqsimlanmagan qoldiqdan ortiq refund rad etiladi', postedPayment(PAY1, 1000) + `
  INSERT INTO refunds (id,payment_id,amount_minor,status,reason,requested_by_id) VALUES (gen_random_uuid(),'${PAY1}',5000,'REQUESTED','x','${U1}')`, /payments_amounts_ck/);
await check('refunds: so\'rovchi o\'zi tasdiqlay olmaydi', postedPayment(PAY1, 1000) + `
  INSERT INTO refunds (id,payment_id,amount_minor,status,reason,requested_by_id) VALUES ('${id(130)}','${PAY1}',500,'REQUESTED','x','${U1}');
  UPDATE refunds SET status='APPROVED', approved_by_id='${U1}' WHERE id='${id(130)}'`, /lacks refunds:approve/);
await check('refunds: FAILED bo\'lsa band qilingan summa qaytariladi', postedPayment(PAY1, 1000) + `
  INSERT INTO refunds (id,payment_id,amount_minor,status,reason,requested_by_id) VALUES ('${id(130)}','${PAY1}',500,'REQUESTED','x','${U1}');
  UPDATE refunds SET status='FAILED' WHERE id='${id(130)}'`, null,
  `SELECT refunded_minor=0 AS ok FROM payments WHERE id='${PAY1}'`);

// ── Gateways ──
const order = (oid, num) => `INSERT INTO payment_orders (id,number,kind,client_id,amount_minor,expires_at)
  VALUES ('${oid}','${num}','FIXED','${CA}',112000000, now()+interval '1 day');`;
await check('payment_orders: Luhn\'i noto\'g\'ri raqam rad etiladi', order(id(140), '1234567890'), /payment_orders_ck/);
const ORD = order(id(140), luhn('123456789')) + `
  INSERT INTO gateway_transactions (id,provider,external_id,payment_order_id,order_kind,amount_minor,provider_time)
  VALUES ('${id(141)}','PAYME','p-1','${id(140)}','FIXED',112000000,now());`;
await check('gateway: FIXED buyurtmada ikkinchi tirik tranzaksiya rad etiladi', ORD + `
  INSERT INTO gateway_transactions (id,provider,external_id,payment_order_id,order_kind,amount_minor,provider_time)
  VALUES (gen_random_uuid(),'PAYME','p-2','${id(140)}','FIXED',112000000,now())`, /one_live_fixed_uq/);
await check('gateway: bir provider tranzaksiyasi ikki marta yozilmaydi (idempotency)', ORD + `
  INSERT INTO gateway_transactions (id,provider,external_id,payment_order_id,order_kind,amount_minor,provider_time)
  VALUES (gen_random_uuid(),'PAYME','p-1','${id(140)}','FIXED',112000000,now())`, /unique|duplicate/);
await check('gateway: CANCELLED → SUCCEEDED o\'tishi rad etiladi', ORD + `
  UPDATE gateway_transactions SET state='CANCELLED', cancelled_at=now(), cancel_reason=4 WHERE id='${id(141)}';
  UPDATE gateway_transactions SET state='SUCCEEDED', performed_at=now() WHERE id='${id(141)}'`, /illegal gateway transaction change/);
await check('gateway: capture → Payment (gateway metodi, darhol POSTED)', ORD + `
  UPDATE gateway_transactions SET state='SUCCEEDED', performed_at=now() WHERE id='${id(141)}';
  INSERT INTO payments (id,code,client_id,method,status,currency,amount_minor,amount_uzs_minor,received_at,gateway_transaction_id)
  VALUES (gen_random_uuid(),'PAY-G','${CA}','PAYME','POSTED','UZS',112000000,112000000,now(),'${id(141)}')`, null);

// ── Ledger ──
const entry = (eid, date, lines) => `INSERT INTO journal_entries (id,idempotency_key,effective_date,source_type,source_id)
  VALUES ('${eid}','k-${eid}','${date}','test','${eid}');` + lines.map(([acc, amt]) =>
  `INSERT INTO journal_lines (entry_id,account_code,client_id,currency,amount_minor,amount_uzs_minor)
   VALUES ('${eid}','${acc}','${CA}','UZS',${amt},${amt});`).join('');
await check('ledger: balanslangan entry qabul qilinadi', entry(id(150), '2026-11-10', [['1200', 112000000], ['4000', -100000000], ['2200', -12000000]]), null);
await check('ledger: balanslanmagan entry rad etiladi (commit\'da)', entry(id(150), '2026-11-10', [['1200', 112000000], ['4000', -100000000]]), /unbalanced/);
await check('ledger: qatorsiz entry rad etiladi', entry(id(150), '2026-11-10', []), /fewer than 2 lines/);
await check('ledger: yopilgan davrga (oktyabr) yozib bo\'lmaydi', entry(id(150), '2026-10-15', [['1200', 1], ['4000', -1]]), /closed or not opened/);
await check('ledger: ochilmagan davrga (dekabr) yozib bo\'lmaydi', entry(id(150), '2026-12-01', [['1200', 1], ['4000', -1]]), /closed or not opened/);
await check('ledger: journal qatorini o\'zgartirib bo\'lmaydi', entry(id(150), '2026-11-10', [['1200', 5], ['4000', -5]]) +
  `UPDATE journal_lines SET amount_minor=6 WHERE entry_id='${id(150)}'`, /append-only/);
await check('fx_rates: kursni o\'zgartirib bo\'lmaydi', `UPDATE fx_rates SET rate=1 WHERE id='${FX1}'`, /append-only/);
await check('fx_rates: CBU kursini o\'chirib bo\'lmaydi', `DELETE FROM fx_rates WHERE id='${FX2}'`, /append-only/);

// ── Releases va deployments ──
const dep = (rel, status, comp = COMP_SRV) => `INSERT INTO deployments (id,code,project_id,component_id,release_id,target_selector,status,created_by_id,updated_at)
  VALUES ('${id(160)}','DEP-1','${P1}','${comp}','${rel}','{}','${status}','${U1}',now());`;
await check('deployments: imzolanmagan (DRAFT) relizni ishga tushirib bo\'lmaydi', dep(R_DRAFT, 'RUNNING'), /requires a signed/);
await check('deployments: READY reliz bilan ishga tushadi', dep(R_READY, 'RUNNING'), null);
const target = (tid, depId, waveId, inst = INST_A, dev = DEV_A) => `INSERT INTO deployment_targets (id,deployment_id,wave_id,device_id,component_id,installation_id,to_release_id,updated_at)
  VALUES ('${tid}','${depId}','${waveId}','${dev}','${COMP_SRV}',${inst ? `'${inst}'` : 'NULL'},'${R_READY}',now());`;
await check('deployment_targets: bitta o\'rnatma bir vaqtda faqat bitta faol deploymentda', dep(R_READY, 'RUNNING') + `
  INSERT INTO deployments (id,code,project_id,component_id,release_id,target_selector,status,created_by_id,updated_at)
    VALUES ('${id(161)}','DEP-2','${P1}','${COMP_SRV}','${R_READY}','{}','RUNNING','${U1}',now());
  INSERT INTO deployment_waves (id,deployment_id,index,percent) VALUES ('${id(170)}','${id(160)}',0,100), ('${id(171)}','${id(161)}',0,100);` +
  target(id(180), id(160), id(170)) + target(id(181), id(161), id(171)), /deployment_targets_one_active_uq/);
await check('deployment_targets: boshqa deploymentning to\'lqiniga bog\'lab bo\'lmaydi', dep(R_READY, 'RUNNING') + `
  INSERT INTO deployments (id,code,project_id,component_id,release_id,target_selector,status,created_by_id,updated_at)
    VALUES ('${id(161)}','DEP-2','${P1}','${COMP_SRV}','${R_READY}','{}','DRAFT','${U1}',now());
  INSERT INTO deployment_waves (id,deployment_id,index,percent) VALUES ('${id(171)}','${id(161)}',0,100);` +
  target(id(180), id(160), id(171)), /foreign key/);
await check('releases: imzolangan relizga artefakt qo\'shib bo\'lmaydi', `
  INSERT INTO release_artifacts (id,release_id,platform,arch,kind,file_id,sha256,sha512,size_bytes,tuf_target_path,custom_meta)
  VALUES (gen_random_uuid(),'${R_READY}','WINDOWS','X64','MSI','${FILE1}','${'a'.repeat(64)}','${'b'.repeat(128)}',10,'pos/x','{}')`, /immutable/);
await check('releases: imzolangan relizning versiyasini o\'zgartirib bo\'lmaydi',
  `UPDATE releases SET version='9.9.9', major=9, minor=9, patch=9 WHERE id='${R_READY}'`, /immutable/);
await check('releases: SemVer bo\'lmagan versiya rad etiladi', `
  INSERT INTO releases (id,project_id,component_id,version,major,minor,patch,version_code,release_notes,created_by_id,updated_at)
  VALUES (gen_random_uuid(),'${P1}','${COMP_SRV}','v1.2',1,2,0,10200,'{}','${U1}',now())`, /releases_ck/);
await check('releases: o\'zi yaratgan relizni o\'zi publish qila olmaydi (SoD)',
  `UPDATE releases SET status='PUBLISHED', published_by_id='${U1}', published_at=now() WHERE id='${R_READY}'`, /releases_ck/);

// ── Audit va partitioning ──
await check('audit_logs: partitioned jadval (default partition)', `
  INSERT INTO audit_logs (id,actor_type,action,resource_type,result) VALUES (gen_random_uuid(),'SYSTEM','test','x','SUCCESS')`, null,
  `SELECT (SELECT count(*) FROM pg_partitioned_table)=4 AND (SELECT count(*) FROM audit_logs_default)=1 AS ok`);
await check('audit_logs: yozuvni o\'zgartirib bo\'lmaydi', `
  INSERT INTO audit_logs (id,actor_type,action,resource_type,result) VALUES ('${id(190)}','SYSTEM','test','x','SUCCESS');
  UPDATE audit_logs SET action='hacked' WHERE id='${id(190)}'`, /append-only/);
await check('audit_logs: oylik partition yaratiladi va yozuvlar unga tushadi', `
  CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
  INSERT INTO audit_logs (id,occurred_at,actor_type,action,resource_type,result) VALUES (gen_random_uuid(),'2026-11-10','SYSTEM','t','x','SUCCESS')`, null,
  `SELECT count(*)=1 AS ok FROM audit_logs_2026_11`);

// ── v2: qurilma sinflari, egalik, ko'p komponentli loyihalar ──
const dev = (did, code, owner, client, cls, mode, gw, platform, arch, site = 'NULL') => `INSERT INTO devices
  (id,code,owner_type,client_id,site_id,device_class,management_mode,gateway_device_id,name,platform,arch,updated_at)
  VALUES ('${did}','${code}','${owner}',${client ? `'${client}'` : 'NULL'},${site},'${cls}','${mode}',${gw ? `'${gw}'` : 'NULL'},'x','${platform}','${arch}',now());`;
const inst = (iid, devId, comp, client, cp) => `INSERT INTO device_installations
  (id,device_id,component_id,project_id,client_id,client_project_id,updated_at)
  VALUES ('${iid}','${devId}','${comp}','${P1}',${client ? `'${client}'` : 'NULL'},${cp ? `'${cp}'` : 'NULL'},now());`;
await check('devices: CLIENT qurilma mijozsiz bo\'lmaydi', dev(id(400), 'DV-X', 'CLIENT', null, 'SERVER', 'AGENT', null, 'LINUX', 'X64'), /devices_ck/);
await check('devices: kompaniya VPS\'i mijozga bog\'lanmaydi', dev(id(400), 'DV-X', 'COMPANY', CA, 'VPS', 'AGENT', null, 'LINUX', 'X64'), /devices_ck/);
await check('devices: ESP32\'da Go agent rejimi rad etiladi', dev(id(400), 'DV-X', 'CLIENT', CA, 'MICROCONTROLLER', 'AGENT', null, 'ESP_IDF', 'XTENSA'), /devices_ck/);
await check('devices: GATEWAY_PROXIED gateway\'siz rad etiladi', dev(id(400), 'DV-X', 'CLIENT', CA, 'MICROCONTROLLER', 'GATEWAY_PROXIED', null, 'ESP_IDF', 'RISCV32'), /devices_ck/);
await check('devices: ESP32 boshqa mijozning gateway\'i orqali boshqarilmaydi',
  dev(id(401), 'DV-Y', 'CLIENT', CB, 'EDGE_SBC', 'AGENT', null, 'LINUX', 'ARM64') +
  dev(id(400), 'DV-X', 'CLIENT', CA, 'MICROCONTROLLER', 'GATEWAY_PROXIED', id(401), 'ESP_IDF', 'XTENSA'), /must be an AGENT device of the same client/);
await check('devices: ESP32 o\'z mijozining Raspberry Pi gateway\'i orqali — OK',
  dev(id(400), 'DV-X', 'CLIENT', CA, 'MICROCONTROLLER', 'GATEWAY_PROXIED', GW_A, 'ESP_IDF', 'XTENSA'), null);
await check('devices: faol o\'rnatmasi bor qurilma egasini o\'zgartirib bo\'lmaydi',
  `UPDATE devices SET owner_type='COMPANY', client_id=NULL, site_id=NULL WHERE id='${DEV_A}'`, /ownership cannot change/);
await check('installations: mijoz qurilmasida umumiy (mijozsiz) instans rad etiladi', inst(id(410), GW_A, COMP_SRV, null, null), /only on COMPANY devices/);
await check('installations: A mijoz qurilmasida B mijoz instansi rad etiladi', inst(id(410), GW_A, COMP_SRV, CB, CPB), /must match the owner/);
await check('installations: FIRMWARE komponent Windows serverga o\'rnatilmaydi', inst(id(410), DEV_A, COMP_FW, CA, CPA), /incompatible with device platform/);
await check('installations: FIRMWARE komponent ESP32\'ga — OK', inst(id(410), ESP_A, COMP_FW, CA, CPA), null);
await check('installations: server komponenti ESP32\'ga o\'rnatilmaydi', inst(id(410), ESP_A, COMP_SRV, CA, CPA), /incompatible with device platform/);
await check('installations: kompaniya VPS\'ida A va B mijoz instanslari + umumiy instans — OK',
  inst(id(410), VPS1, COMP_SRV, CA, CPA) + inst(id(411), VPS1, COMP_SRV, CB, CPB) + inst(id(412), VPS1, COMP_WEB, null, null), null,
  `SELECT count(*)=3 AS ok FROM device_installations WHERE device_id='${VPS1}'`);
await check('installations: bitta qurilmada bir mijozning ikkinchi instansi rad etiladi',
  inst(id(410), VPS1, COMP_SRV, CA, CPA) + inst(id(411), VPS1, COMP_SRV, CA, CPA), /device_installations_client_uq/);
await check('installations: boshqa komponentning relizini current qilib bo\'lmaydi', `
  INSERT INTO releases (id,project_id,component_id,version,major,minor,patch,version_code,release_notes,created_by_id,updated_at)
  VALUES ('${id(420)}','${P1}','${COMP_WEB}','1.0.0',1,0,0,10000,'{}','${U1}',now());
  UPDATE device_installations SET current_release_id='${id(420)}' WHERE id='${INST_A}'`, /foreign key/);
await check('releases: turli komponentlarda bir xil versiya — OK, bitta komponentda dublikat — rad', `
  INSERT INTO releases (id,project_id,component_id,version,major,minor,patch,version_code,release_notes,created_by_id,updated_at)
  VALUES (gen_random_uuid(),'${P1}','${COMP_WEB}','1.0.0',1,0,0,10000,'{}','${U1}',now());
  INSERT INTO releases (id,project_id,component_id,version,major,minor,patch,version_code,release_notes,created_by_id,updated_at)
  VALUES (gen_random_uuid(),'${P1}','${COMP_SRV}','1.0.0',1,0,0,10001,'{}','${U1}',now())`, /releases_component_id_version_key|duplicate/);
await check('deployments: boshqa komponentning relizi bilan deployment rad etiladi', dep(R_READY, 'DRAFT', COMP_WEB), /foreign key/);
await check('deployment_targets: VPS\'dagi A va B instanslari bir deploymentda parallel — OK',
  inst(id(410), VPS1, COMP_SRV, CA, CPA) + inst(id(411), VPS1, COMP_SRV, CB, CPB) + dep(R_READY, 'RUNNING') +
  `INSERT INTO deployment_waves (id,deployment_id,index,percent) VALUES ('${id(170)}','${id(160)}',0,100);` +
  target(id(180), id(160), id(170), id(410), VPS1) + target(id(181), id(160), id(170), id(411), VPS1), null);
await check('deployment_targets: target qurilmasi o\'rnatma qurilmasiga mos bo\'lishi shart', dep(R_READY, 'RUNNING') +
  `INSERT INTO deployment_waves (id,deployment_id,index,percent) VALUES ('${id(170)}','${id(160)}',0,100);` +
  target(id(180), id(160), id(170), INST_A, VPS1), /foreign key/);
const agentRel = `INSERT INTO releases (id,project_id,component_id,version,major,minor,patch,version_code,status,release_notes,created_by_id,tuf_role_version,updated_at)
  VALUES ('${id(430)}','${P_AGENT}','${COMP_AGENT}','1.4.0',1,4,0,10400,'READY','{}','${U1}',1,now());`;
const agentDep = (did, code) => `INSERT INTO deployments (id,code,project_id,component_id,release_id,target_selector,status,created_by_id,updated_at)
  VALUES ('${did}','${code}','${P_AGENT}','${COMP_AGENT}','${id(430)}','{}','RUNNING','${U1}',now());
  INSERT INTO deployment_waves (id,deployment_id,index,percent) VALUES ('${did.slice(0, -3)}9${did.slice(-2)}','${did}',0,100);`;
const agentTarget = (tid, did) => `INSERT INTO deployment_targets (id,deployment_id,wave_id,device_id,component_id,installation_id,to_release_id,updated_at)
  VALUES ('${tid}','${did}','${did.slice(0, -3)}9${did.slice(-2)}','${DEV_A}','${COMP_AGENT}',NULL,'${id(430)}',now());`;
await check('agent self-update: bitta qurilmada bir vaqtda faqat bitta faol agent deploymenti',
  agentRel + agentDep(id(440), 'DEP-A1') + agentDep(id(441), 'DEP-A2') + agentTarget(id(450), id(440)) + agentTarget(id(451), id(441)),
  /deployment_targets_one_active_agent_uq/);
await check('payments: rahbar o\'zi kiritgan to\'lovni o\'zi tasdiqlaydi — OK', `
  INSERT INTO payments (id,code,client_id,method,status,currency,amount_minor,amount_uzs_minor,received_at,created_by_id)
  VALUES ('${PAY1}','PAY-D','${CA}','CASH','PENDING_APPROVAL','UZS',100,100,now(),'${U2}');
  UPDATE payments SET status='POSTED', approved_by_id='${U2}' WHERE id='${PAY1}'`, null);
await check('payments: ruxsati yo\'q xodim (support) tasdiqlay olmaydi', `
  INSERT INTO payments (id,code,client_id,method,status,currency,amount_minor,amount_uzs_minor,received_at,created_by_id)
  VALUES ('${PAY1}','PAY-D','${CA}','CASH','PENDING_APPROVAL','UZS',100,100,now(),'${U1}');
  UPDATE payments SET status='POSTED', approved_by_id='${U3}' WHERE id='${PAY1}'`, /lacks payments:approve/);
await check('payments: rahbar roli muddati tugagan bo\'lsa tasdiqlay olmaydi', `
  UPDATE user_role_assignments SET expires_at = now() - interval '1 day' WHERE user_id='${U2}';
  INSERT INTO payments (id,code,client_id,method,status,currency,amount_minor,amount_uzs_minor,received_at,created_by_id)
  VALUES ('${PAY1}','PAY-D','${CA}','CASH','PENDING_APPROVAL','UZS',100,100,now(),'${U1}');
  UPDATE payments SET status='POSTED', approved_by_id='${U2}' WHERE id='${PAY1}'`, /lacks payments:approve/);
await check('approvals: policy ruxsat bersa (allow_self_approval) rahbar o\'z so\'rovini tasdiqlaydi', `
  UPDATE approval_policies SET allow_self_approval = true WHERE key='${POL}';
  INSERT INTO approval_requests (id, policy_key, resource_type, payload, payload_hash, requested_by_id, expires_at, updated_at)
    VALUES ('${id(91)}','${POL}','payment','{}','h','${U2}', now() + interval '1 day', now());
  INSERT INTO approval_decisions (id,request_id,approver_id,approve) VALUES (gen_random_uuid(),'${id(91)}','${U2}',true)`, null);
const depReq = `INSERT INTO approval_requests (id, policy_key, resource_type, payload, payload_hash, requested_by_id, expires_at, updated_at)
  VALUES ('${id(92)}','deployments.production','deployment','{}','h','${U1}', now() + interval '1 day', now());`;
const delegate = (exp) => `INSERT INTO roles (id,key,name,updated_at) VALUES ('${id(93)}','manager_delegate','Menejer (rahbar ruxsati)',now());
  INSERT INTO role_permissions (role_id, permission_key) VALUES ('${id(93)}','deployments:approve');
  INSERT INTO user_role_assignments (id,user_id,role_id,granted_by_id,expires_at) VALUES (gen_random_uuid(),'${U3}','${id(93)}','${U2}',${exp});`;
await check('approvals: ruxsati yo\'q xodim (menejer) prod deploymentni tasdiqlay olmaydi', depReq + `
  INSERT INTO approval_decisions (id,request_id,approver_id,approve) VALUES (gen_random_uuid(),'${id(92)}','${U3}',true)`, /lacks the approver permission/);
await check('approvals: rahbar menejerga muddatli ruxsat bersa — menejer tasdiqlaydi', depReq + delegate(`now() + interval '7 days'`) + `
  INSERT INTO approval_decisions (id,request_id,approver_id,approve) VALUES (gen_random_uuid(),'${id(92)}','${U3}',true)`, null);
await check('approvals: delegatsiya muddati tugagach menejer tasdiqlay olmaydi', depReq + delegate(`now() - interval '1 day'`) + `
  INSERT INTO approval_decisions (id,request_id,approver_id,approve) VALUES (gen_random_uuid(),'${id(92)}','${U3}',true)`, /lacks the approver permission/);
await check('FX qayta baholash: oy USD AR qayta baholanmaguncha yopilmaydi',
  `UPDATE financial_periods SET closed_at = now() WHERE month='2026-11-01'`, /financial_periods_ck/);
await check('FX qayta baholash: USD AR (0 sent, +UZS) ↔ 7150 entry balanslanadi va oy yopiladi', `
  INSERT INTO journal_entries (id,idempotency_key,effective_date,source_type,source_id)
    VALUES ('${id(460)}','fxreval:2026-11:x','2026-11-30','FX_REVALUATION','${id(460)}');
  INSERT INTO journal_lines (entry_id,account_code,client_id,currency,amount_minor,amount_uzs_minor) VALUES
    ('${id(460)}','1200','${CB}','USD',0,1120000), ('${id(460)}','7150',NULL,'UZS',-1120000,-1120000);
  SET CONSTRAINTS ALL IMMEDIATE;
  UPDATE financial_periods SET fx_revalued_at = now() - interval '1 second', closed_at = now() WHERE month='2026-11-01'`, null);

// ── Portal RLS ──
const asPortal = (client, sql) => `SET LOCAL ROLE app_portal; ${client ? `SELECT set_config('app.client_id','${client}',true);` : ''} ${sql}`;
await check('RLS: portal faqat o\'z mijozining invoice\'larini ko\'radi', asPortal(CA, 'SELECT 1'), null,
  `SELECT count(*)=1 AND bool_and(client_id='${CA}') AS ok FROM invoices`);
await check('RLS: app.client_id o\'rnatilmasa hech narsa ko\'rinmaydi (fail closed)', asPortal(null, 'SELECT 1'), null,
  `SELECT (SELECT count(*) FROM invoices)=0 AND (SELECT count(*) FROM clients)=0 AS ok`);
await check('RLS: portal boshqa mijoz nomidan checkout buyurtmasi yarata olmaydi', asPortal(CA, `
  INSERT INTO payment_orders (id,number,kind,client_id,amount_minor,expires_at)
  VALUES (gen_random_uuid(),'${luhn('123456780')}','FIXED','${CB}',1,now()+interval '1 day')`), /row-level security/);
await check('RLS: portal invoice\'ni o\'zgartira olmaydi (grant yo\'q)', asPortal(CA, `UPDATE invoices SET row_version=2`), /permission denied/);
await check('RLS: portal boshqa loyihalar va tariflarni ko\'rmaydi', `
  INSERT INTO projects (id,code,name,updated_at) VALUES ('${id(300)}','secret','Maxfiy loyiha',now());` + asPortal(CA, 'SELECT 1'), null,
  `SELECT count(*)=1 AS ok FROM projects`);

console.log(`\n${pass} passed, ${fail} failed`);
fs.writeFileSync('results.json', JSON.stringify({ pass, fail, results }, null, 2));
process.exit(fail ? 1 : 0);
```
</details>

<details><summary><code>add_maps.py</code> — camelCase maydonlarga <code>@map("snake_case")</code> qo'shish</summary>

```python
"""Add @map("snake_case") to camelCase scalar fields of every model (relation fields skipped)."""
import re, sys, pathlib
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
files = sorted(src.glob("*.prisma"))
text_all = "\n".join(f.read_text() for f in files)
models = set(re.findall(r"^model\s+(\w+)", text_all, re.M))
snake = lambda n: re.sub(r"(?<=[a-z0-9])([A-Z])", r"_\1", n).lower()
field_rx = re.compile(r"^(\s+)(\w+)(\s+)([\w]+)(\[\])?(\?)?(.*)$")
added = 0
for f in files:
    out, in_model = [], False
    for line in f.read_text().splitlines():
        if re.match(r"^model\s+\w+\s*\{", line): in_model = True
        elif in_model and line.strip() == "}": in_model = False
        elif in_model and not line.strip().startswith(("@@", "//", "///")) and line.strip():
            m = field_rx.match(line)
            if m:
                ind, name, sp, typ, lst, opt, rest = m.groups()
                if typ not in models and name != snake(name) and "@map(" not in rest:
                    code, sep, comment = rest.partition("//")
                    code = code.rstrip() + f' @map("{snake(name)}")'
                    line = f"{ind}{name}{sp}{typ}{lst or ''}{opt or ''}{code}" + (f" //{comment}" if sep else "")
                    added += 1
        out.append(line)
    (dst / f.name).write_text("\n".join(out) + "\n")
print(f"models={len(models)} maps_added={added}")
```
</details>
