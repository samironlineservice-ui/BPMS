# ADS-ERP — ishlash konvensiyalari

Foydalanuvchi bilan **o'zbek tilida** (texnik atamalar inglizcha). UI matnlari ham o'zbekcha (lotin). Loyiha faqat **menejment** (sayt). Qurilmalardagi dasturlar kodi mustaqil, agent — P9 da.

## Ishga tushirish
- `npm run dev` — PostgreSQL (embedded, :5544), `tsc -b -w`, API (:3100), worker, admin (:5173), portal (:5174).
- Build: `npx tsc -b` (server, contracts, db) va `npx tsc -p apps/<app>/tsconfig.app.json --noEmit` + `npx vite build` (frontend). Route tree'ni `vite build`/dev generatsiya qiladi.
- **Vite 7 dan yuqoriga ko'tarmang**: CPU'da AVX2 yo'q, Rolldown qulaydi. Root `overrides.vite` bor. `@tailwindcss/vite` ishlatilmaydi (`@tailwindcss/postcss` ishlatiladi).
- Docker yo'q. DB rollari: `app_migrator` (egasi, migratsiyalar), `app_rw` (API/worker), `app_portal` (RLS), `app_readonly`.

## Ma'lumotlar bazasi
- Schema: `packages/db/prisma/schema/*.prisma` (snake_case `@map`). O'zgarish: schema → `npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema --script` → yangi `prisma/migrations/000N_*/migration.sql` → `prisma migrate deploy` → `prisma generate`.
- CHECK/trigger/RLS — migratsiya SQL'ida (manba: `docs/architecture/database/integrity.sql`). Prisma ularni ko'rmaydi, shuning uchun drift'da chiqmaydi.
- Append-only jadvallar (allocations, journal_*, credit_notes, audit_logs …): faqat INSERT. Tuzatish — teskari yozuv. `app_rw` ba'zi jadvallarda DELETE qila olmaydi (clients, projects, files, payments …). Ular uchun soft delete ishlatiladi.
- Raw SQL'da BigInt parametr: `${x}::bigint`. Sana: `${dbDate(d)}::date`. Enum: `${v}::"Currency"`.
- Global seriyalar `SequenceService.code(tx, 'CL')` (year 0), yillik: `{ year }`.

## Pul va sana
- Pul: **BigInt minor units**. API'da string. Arifmetika `@ads/contracts/money` (`mulDivRound` = PostgreSQL `round`). Hech qachon float ishlatilmaydi.
- Kurs: scaled bigint ×10⁶ (`parseRate`/`rateToString`), DB'da `Decimal(18,6)`. USD kursi `FxService.rateOn/requireRate`.
- Biznes sanalar: `platform/time.ts`: `todayLocal()`, `dbDate()`, `dayStart()`, `nowInstant()` (Asia/Tashkent). `setTodayOverride` — FAQAT seed uchun.
- Ko'rsatish: `formatMoney` (Intl'siz). Davr tugash sanasi DB'da ochiq chegara, UI'da `periodRange()`.

## Server (NestJS)
- Modul = `apps/server/src/modules/<x>/`. Platforma: `platform/` (Db, PortalDb, AuditService, OutboxService, SequenceService, auth).
- Har endpoint'da `@RequirePermissions(...)` (ruxsatlar katalogi: `packages/contracts/src/permissions.ts`). Kirish: Zod (`ZodPipe`). Xatolar `AppError` / `notFound` / `conflict` (RFC 9457).
- **PATCH sxemalarida `.default()` bo'lmasin**: `.partial()` default'ni qo'yib yuboradi. Default'siz `fields` obyektidan quriladi (clients.ts namunasi).
- O'zgarish + audit (`audit.record(tx, …)`) + outbox event — bitta tranzaksiyada. Optimistic lock: `rowVersion`.
- Ruxsat berishda **subset qoidasi**: berayotgan shaxsda bo'lmagan ruxsatni berib bo'lmaydi. Rahbarning individual ruxsatlari shaxsiy rol `u_<userid>` orqali beriladi.
- Tasdiqlar: `ApprovalsService.request(tx, {policyKey,…})` + handler `register(policyKey, {describe, execute})`. Ruxsati bor so'rovchi (allowSelfApproval) bo'lsa, so'rov darhol bajariladi. Qo'lda to'lov va refund o'z holat mashinasi bilan ishlaydi.
- Billing: `LifecycleService` (revision'lar, holat o'tishlari, MRR) → `InvoicingService` → `PaymentsService` (taqsimlash, lock tartibi: avval to'lovlar, keyin invoice'lar, id bo'yicha) → `DunningService`. Kelajakdagi revision YO'Q: "keyingi davrdan" o'zgarish → `subscriptions.pending_change`.
- Relizlar (agentsiz): READY = `tufRoleVersion: 0`. READY bo'lgan reliz o'zgarmaydi (trigger).
- TOTP: `mfaEnforced` (`config/env.ts`). `MFA_ENABLED=false` faqat lokal uchun, production'da e'tiborga olinmaydi; o'chiq paytda sessiyaga "tasdiqlandi" yozilmaydi (qayta yoqilsa darhol kuchga kiradi).
- Portal: `@Public()` + `@UseGuards(PortalGuard)`; ma'lumot faqat `PortalDb.forClient(p.clientId, …)` orqali olinadi (RLS). `clientId` hech qachon so'rovdan olinmaydi.
- Kabinet rollari: `@PortalRoles(...FINANCE_ROLES | WRITE_ROLES | 'OWNER')` (portal-auth.ts); `accessOf(role)` → `me.access` (frontend `useAccess()`, route'da `requireAccess('finance')`). TECHNICIAN uchun summalar `null` qaytadi.
- Kabinetda ro'yxatdan o'tish: `PortalService.register` — yangi LEAD mijoz (`ClientsService.createIn`) + kontakt + OWNER + ixtiyoriy murojaat (`RequestsService.createIn`) bitta tranzaksiyada; mavjud mijozga hech qachon ulanmaydi. Boshqaruv saytida ro'yxatdan o'tish YO'Q (akkauntni rahbar yaratadi).
- Murojaatlar (`modules/requests`): yozish — `RequestsService` (app_rw, clientId FAQAT sessiyadan, audit + outbox bitta tranzaksiyada); o'qish — PortalDb (RLS). Xabarlar append-only; `is_internal` izohlar RLS bilan mijozga ko'rinmaydi; bog'langan obuna/qurilma egaligini trigger tekshiradi.
- Worker: `SchedulerService` (croner + advisory lock), outbox relay → `EventBus`. Bildirishnomalar: `NotificationsService.notifyStaff`.
- To'lov tizimlari (`modules/gateways`, ADR-0021):
  - **Webhook'lar:** `@Public()` + `@SkipCsrf()`, javob har doim provayder formatida. Har so'rov `CaptureService.logEvent` bilan `gateway_events`ga yoziladi.
  - **Pulni faqat `CaptureService`** qayd etadi (`begin` / `succeed` / `createSucceeded` / `cancel`): Payment + ledger + buyurtma + audit + outbox bitta tranzaksiyada, (provider, externalId) bo'yicha idempotent. Taqsimlash va obuna yaratish (`onPaid` hook) commit'dan keyin.
  - **Sozlamalar:** `GatewayConfigService.get/active` (EMULATOR / TEST / PROD). Emulyator `isProd`da hech qachon ishlamaydi.
  - **Kartalar:** faqat shifrlangan token. Karta raqami logga yozilmaydi. Provayder xatosi → `viaProvider` → 400/502.
  - **Kabinetda pul amallari:** `@PortalRoles(...PAY_ROLES)`, frontend'da `requireAccess('pay')`.
  - **Checkout summasi** billing bilan bir formulada (`periodBounds` + `itemLines`); obuna to'lovdan KEYIN yaratiladi.

## Frontend
- `apps/admin-web/src`: `routes/` (TanStack file-based), `features/<modul>/` (api.ts — queryOptions, forma/dialoglar, jadvallar), `components/common` (DataTable, Field, Money, StatusBadge, Confirm, SearchInput, AsyncCombobox).
- Ruxsat: `useCan()('perm')` — faqat UX uchun, haqiqiy tekshiruv serverda. Mutatsiyadan keyin tegishli query kalitlari invalidatsiya qilinadi (`MONEY_KEYS`, `DEVICE_KEYS`).
- Dropdown ichidagi dialog yoki fayl input'i menyu tashqarisida bo'lishi kerak (controlled `Confirm`).
- Grafiklar: `--series-1/2` (tasdiqlangan palitra), bitta o'q.
- Portal (`apps/portal-web`): o'zining `api.ts` (`/api/v1/portal`), shadcn komponentlari nusxa.

## Git
- Foydalanuvchi so'ramaguncha commit qilinmaydi.
