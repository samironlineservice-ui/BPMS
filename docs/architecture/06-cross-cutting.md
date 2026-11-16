# Cross-cutting, Frontend va DevOps

> ADS-ERP arxitektura hujjatlari · tasdiqlangan reja (2026-11-10) asosida · [Hujjatlar indeksi](../README.md)

## 10. Cross-cutting, Frontend va DevOps

### 10.1 Audit pipeline
- Use-case ichida aniq chaqiruv: `auditService.record(tx, {action:'invoice.void', resource, before, after, reason})` — biznes ma'noli yozuv, biznes o'zgarish bilan **bitta tranzaksiyada**. Generic Prisma middleware ishlatilmaydi (u ma'noni bilmaydi).
- Global interceptor 401/403 (DENIED) urinishlarni avtomatik yozadi; login/logout/MFA hodisalari ham.
- Diff faqat o'zgargan maydonlar; model bo'yicha redaction ro'yxati.
- **Tungi seal job:** `seq` bo'yicha (1 soatdan eski — barcha tranzaksiyalar commit bo'lgan) yozuvlar uchun hash-chain + Ed25519 imzo → `AuditSeal`; seal hashlari tashqi joyga ham eksport (object-lock bucket). `audit:verify` (UI + CLI) zanjirni qayta hisoblaydi; nomuvofiqlik → **critical alert**.
- UI: actor/resource/action/sana filtrlari; har entity sahifasida "Tarix" tab.

### 10.2 Notification pipeline
```
outbox event → NotificationRouter (qoida: eventType → qabul qiluvchilar resolver'i → preference bo'yicha kanallar)
  → Notification (dedupeKey) → BullMQ: notify.in_app | notify.email | notify.telegram
  → adapter (NotificationChannelPort) → status; retry 1m/5m/30m/2h/12h → DLQ + ops alert
```
- Misol: `invoice.overdue` → mijozning billing kontaktlari (Telegram/email) + account manager (in-app) + finance jamoasi (digest).
- Rate limit: Telegram ~25 msg/s global, 1 msg/s har chatga; quiet hours (22:00–08:00) kritik bo'lmaganlar uchun `scheduledAt`.
- **Telegram ulash:** profil → "Telegram'ni ulash" → `t.me/<bot>?start=<token>` (10 daq, bir martalik) → bot `/start <token>` → `ChannelIdentity`. Portal userlar ham xuddi shunday. Xabarlarda maxfiy tafsilot minimal — batafsil ma'lumot portal havolasi orqali.
- Shablonlar: event × kanal × til; admin UI'da preview + test yuborish; Handlebars strict, Telegram MarkdownV2 escaping, email — React Email.

### 10.3 Observability
- Log: pino JSON (requestId, actor, module, latency) → Loki. Trace: OpenTelemetry (HTTP, Prisma, BullMQ, Redis) → Tempo. Metrika: Prometheus.
- **Alertlar** (Grafana → ops Telegram kanali): 5xx > 1%, p95 oshishi, outbox lag > 1 daq, DLQ > 0, backup xatosi, disk > 80%, gateway webhook xatolari, billing run xatosi, 10 daqiqada qurilmalarning > 20% oflayn, **audit seal verify xatosi**, TLS sertifikat muddati, **TUF metadata muddati (30/14/7 kun oldin)**, CBU kursi olinmagani, rekonsiliatsiya farqlari, tungi integrity checker nomuvofiqligi.
- `/health/live`, `/health/ready` (DB, Redis, S3). Sentry/GlitchTip (FE+BE, PII scrubbing).

### 10.4 Backup va Disaster Recovery
- **Lokal bosqichda (P0–P7):** kunlik `pg_dump` + S3/disk'ka nusxa va haftalik restore testi. Quyidagi to'liq sxema — **VPS deploy (P8)** bilan.
- PostgreSQL: **pgBackRest** — haftalik full, kunlik differential, uzluksiz WAL archiving → boshqa data-center'dagi shifrlangan S3; PITR. **RPO ≤ 15 daq** (amalda ~1 daq).
- Object storage: versioning + ikkinchi joyga replikatsiya.
- Redis — manba emas (navbatlar outbox'dan tiklanadi, sessiyalar qayta login).
- **Oylik restore mashqi** (staging'ga avtomatik tiklash + row count/checksum + audit seal verify); runbook; **RTO ≤ 4 soat**.

### 10.5 Frontend arxitekturasi va dizayn tizimi
```
apps/admin-web/src/
├─ routes/                 # TanStack Router file-based: _auth/login, _app/clients/index, _app/clients/$clientId/...
├─ features/<modul>/       # komponentlar, hooklar, formalar, jadval ustunlari (schema'lar contracts'dan)
└─ shared/                 # api-client, ability (CASL), i18n, layout, sse, utils
```
- **State:** server state → TanStack Query (mutation va SSE event'larida invalidation); URL state → Router search params (Zod bilan tiplangan: filtr, sort, sahifa, tab — havolani ulashish mumkin); lokal UI → React state (minimal Zustand).
- **Jadvallar:** TanStack Table, server-side pagination/sort/filter, ustunlarni boshqarish, saqlangan ko'rinishlar (SavedView), bulk amallar, eksport, virtualizatsiya, klaviatura navigatsiyasi.
- **Formalar:** RHF + zodResolver; `If-Match` yuboriladi; 409 da "yozuv o'zgargan" diff dialogi.
- **Dizayn tizimi:** shadcn/ui + Tailwind v4 design tokens (CSS variables) — light/dark/system, brend rangi, zichlik (comfortable/compact), Inter/Geist shrift. Yagona sahifa andozalari: **List** (filtr paneli + saved views + jadval), **Detail** (status badge + amallar + tablar: Overview / Obunalar / Invoicelar / Qurilmalar / Fayllar / Tarix), **Sheet** (yon panel formalar), **Command palette** (Cmd+K: navigatsiya, qidiruv, tezkor amallar), skeleton/empty state'lar, sonner toastlar, shadcn charts.
- **Accessibility:** WCAG 2.2 AA, klaviatura-first, Playwright + axe tekshiruvi.
- **Performance:** route-based code splitting, hover'da prefetch, boshlang'ich JS < 250 KB gz.
- **i18n:** i18next namespace'lar, ICU plurals, `Intl` formatlash (`1 250 000,00 so'm`, `$1,250.00`).
- **Real-time:** `GET /api/v1/stream` (SSE) → qurilma statusi, deployment progress, bildirishnoma badge.
- **Portal:** soddaroq navigatsiya, mobile-first, "To'lash" CTA ko'zga tashlanadi; keyin PWA.

### 10.6 Test strategiyasi
| Daraja | Vosita | Nima |
|---|---|---|
| Unit | Vitest | domain: billing hisob-kitobi, proration, state machine'lar, permission resolution (domain coverage ≥ 90%) |
| Property-based | fast-check | pul invariantlari: Σallocation ≤ payment, balans manfiy emas, FX round-trip |
| Integration | Testcontainers (PG + Redis) | repository'lar, **constraint test suite**, RLS, outbox, idempotency, **parallel to'lovlar** (concurrency) |
| Contract | oasdiff, umumiy test vektorlar | OpenAPI breaking change; agent ↔ server protokoli (Go va TS bir xil fixture'lar) |
| E2E | Playwright | login+2FA; mijoz→obuna→invoice→to'lov; release→deployment→(simulyatsiya qilingan agent) muvaffaqiyat; portal'dan gateway (sandbox/mock) orqali to'lash |
| Agent | Go test + fuzz, Windows/Linux VM matritsasi | TUF metadata/target parsing va verify fuzz; install/rollback haqiqiy OS'da; har jurnal qadamida kill/tok uzish |
| Security | ZAP baseline, Semgrep, dependency scan, go-live oldidan tashqi pentest | |
| Load | k6 | 10 000 simulyatsiya qilingan agent; admin API |

### 10.7 CI/CD va muhitlar
- Muhitlar: **local** (docker compose — ishlab chiqish va birinchi ishlaydigan tizim), keyin **staging** va **production** (VPS, P8). Gateway sandbox'lari — integratsiya bosqichida (P10).
- Pipeline: PR → lint (eslint, prettier, dependency-cruiser) → typecheck → unit → integration → build → OpenAPI diff → security scan → merge → image (git sha tag) → staging (`prisma migrate deploy` alohida job → rolling restart) → E2E smoke → qo'lda approval → prod.
- Migratsiyalar: **expand/contract** (bir reliz orqaga moslik), faqat `app_migrator` roli bilan, prod'da hech qachon `migrate dev`.
- Conventional commits, changesets, `docs/adr/` da ADR'lar.
- Agent CI: Go build matritsasi (windows/amd64, windows/386, linux/amd64, linux/arm64, linux/armv7), Windows binary/MSI uchun **Authenticode imzo** (SmartScreen/antivirus muammolarining oldini oladi), nfpm (.deb/.rpm), SBOM (syft), provenance; agentning o'zi `ads-agent` loyihasi sifatida xuddi shu release pipeline'dan offline imzo bilan chiqadi.
