# Umumiy ko'rinish: kontekst, talablar, texnologiyalar

> ADS-ERP arxitektura hujjatlari · tasdiqlangan reja (2026-11-10) asosida · [Hujjatlar indeksi](../README.md)

## 0. Context

Kompaniya turli yo'nalishdagi dasturiy loyihalar (AI, avtomatizatsiya, hisobot va h.k.) ishlab chiqadi va ularni mijozlarga **oylik obuna** asosida beradi. Loyiha bir nechta **komponentdan** iborat bo'lishi mumkin: ba'zi qismlari **VPS**da, ba'zilari **mijozning lokal qurilmasida** ishlaydi — oddiy server (Core i3), **GPU server**, **Raspberry Pi**, **ESP32** mikrokontroller yoki Windows/Linux kompyuter. Hozir mijozlar, obunalar, to'lovlar, qurilmalar va versiyalarni yagona joyda boshqaradigan tizim yo'q. Maqsad — bitta markaziy tizim:
- mijoz ↔ loyiha (M:N) munosabatlari, obunalar, hisob-fakturalar, to'lovlar va moliyaviy statistikani yuritadi;
- dastur versiyalari va fayllarini markazdan boshqaradi, ularni **xavfsiz update agent** orqali qurilmalarga yetkazadi;
- xodimlar uchun admin panel, mijozlar uchun portal, Telegram/email/in-app bildirishnomalar beradi;
- har bir muhim harakatni o'zgartirib bo'lmaydigan audit logga yozadi.

Ustuvorliklar: **data integrity → security → maintainability → extensibility**.

Foydalanuvchi tasdiqlagan qarorlar:
| Savol | Javob |
|---|---|
| Qurilmalar | VPS (**kompaniyaniki**), oddiy server (Core i3), GPU server, Raspberry Pi, ESP32 — birinchi versiyada saytda **reyestr va qo'lda kuzatuv**; Android kerak emas |
| Tizim maqsadi | **ADS-ERP faqat menejment uchun**; loyihalar kodi (AI, avtomatizatsiya, firmware …) mustaqil ishlab chiqiladi va ishga tushiriladi |
| Agent tili | **Go** (ESP32 uchun — ESP-IDF firmware SDK) |
| To'lov tasdig'i | Qo'lda kiritilgan to'lovni **rahbar akkaunti** tasdiqlaydi |
| Yuridik shaxs | Hozircha firma yo'q → QQS 0; e-faktura, fiskal chek, 1C — keyin integratsiya qilinadi |
| USD qarzdorlik | Oy oxirida joriy kurs bo'yicha **qayta baholanadi** |
| Ish tartibi | **Avval ishlaydigan tizim (lokal)** → mukammallashtirish va optimallashtirish → VPS deploy → integratsiyalar |
| Mavjud ma'lumot | Yo'q — migratsiya kerak emas, demo ma'lumot generatori bo'ladi |
| Update imzolash kalitlari | 3 kishi — root va targets uchun **2-of-3** (qurilma agenti bosqichida) |
| Hozirgi ustuvorlik | **Sayt qismi**; qurilma agenti keyin — avval soddalashtirilgan "imzolangan faylni yuborish va ishga tushirish" |
| Tasdiqlash huquqi | Rahbar tasdiqlaydi; rahbar ruxsatni **menejer akkauntiga** berishi mumkin (doimiy yoki muddatli) |
| v1 qamrovi | Ko'p valyuta (UZS+USD), Telegram, mijozlar portali — v1 da. **Payme/Click/Uzum — integratsiya bosqichida** (firma va merchant akkauntlar ochilgach) |

## 1. Talablar tahlili

### 1.1 Aktorlar
| Aktor | Tavsif | Kirish nuqtasi |
|---|---|---|
| Xodim (Staff) | Admin, moliyachi, menejer, dasturchi, support | Admin Web (`admin.<domain>`) |
| Mijoz foydalanuvchisi (Portal User) | Mijoz kompaniyasining egasi/buxgalteri/xodimi | Portal Web (`portal.<domain>`) |
| Qurilma (Device Agent) | Go agent (server, GPU server, Raspberry Pi, VPS) yoki ESP32 firmware SDK | Agent API (`agent.<domain>`) |
| To'lov tizimi (Gateway) | Payme / Click / Uzum serverlari | Webhook API (`pay.<domain>`) |
| Telegram | Bot webhook | `api.<domain>/webhooks/telegram` |
| Tizim (System) | Scheduler/worker (billing run, kurs, sweeper) | ichki |
| Release pipeline (CI) | Mahsulot build'ini imzolab yuklaydi | Admin API (service account) |

### 1.2 Funksional talablar (modul bo'yicha qisqa)
- **Dashboard** — rolga mos widgetlar: MRR, tushum, qarzdorlik, onlayn/oflayn qurilmalar, muvaffaqiyatsiz deploymentlar, global qidiruv (Cmd+K).
- **Clients** — kompaniya/jismoniy shaxs, STIR (INN)/PINFL, bank rekvizitlari, kontaktlar, filiallar (site), teglar, mas'ul menejer, faoliyat lentasi, Excel/CSV import.
- **Projects** — loyiha reyestri, **komponentlar** (VPS servisi, GPU stack, ESP32 firmware, web, desktop), jamoa a'zolari (project-scoped rollar), qo'llab-quvvatlanadigan platformalar, kanallar (stable/beta/canary), tariflar, mijozlarga biriktirish (M:N).
- **Subscriptions** — tarif, narx snapshot, miqdor (qurilma/filial soni), trial, holatlar (trial/active/past_due/suspended/cancelled/expired), grace period, tarif/miqdor o'zgarishi, MRR harakatlari tarixi.
- **Payments & Finance** — avtomatik oylik invoice, invoice raqamlash, qisman to'lov, bir to'lov → bir nechta invoice, ortiqcha to'lov → kredit balans, refund, void, mijoz bo'yicha akt-sverka (ledger), UZS+USD + MB kursi snapshot, oy oxiri qayta baholash, qo'lda to'lov kiritish (**rahbar tasdig'i**), Payme/Click/Uzum (integratsiya bosqichida), (keyinroq) xarajatlar.
- **Analytics & Reports** — MRR/ARR, churn, ARPA, tushum (loyiha/mijoz/davr), debitorlik aging (0-30/31-60/61-90/90+), to'lov usullari, valyuta kesimi, qurilmalar salomatligi, versiya tarqalishi, deployment muvaffaqiyati; CSV/XLSX/PDF eksport; rejali hisobotlar.
- **Devices** — qurilma sinfi (server/GPU/VPS/Raspberry Pi/ESP32/desktop) va egasi (mijoz yoki kompaniya), enrollment token, qurilma identifikatsiyasi, heartbeat/online status, inventar (OS, HW), o'rnatilgan dasturlar va versiyalar, teglar, maintenance window, ruxsat etilgan buyruqlar (allowlist), revoke/decommission. **P0–P8: saytda reyestr va qo'lda kuzatuv; avtomatik boshqaruv — P9.**
- **Software Versions** — **komponent bo'yicha** release (SemVer), artefakt turlari (servis, Docker Compose, AI model, ESP32 firmware, web, desktop), platforma/arxitektura bo'yicha artefaktlar, release notes, imzo tekshiruvi, holatlar (draft→published→deprecated→revoked), minimal agent versiyasi, majburiy (critical) yangilanish, upgrade yo'li cheklovlari. **P0–P8: versiyalar va fayllar reyestri; qurilmaga avtomatik yetkazish — P9.**
- **Deployments** — komponent relizini o'rnatmalarga (bitta VPS'da bir nechta mijoz instansi bo'lishi mumkin) yetkazish; target tanlash (mijoz/filial/qurilma sinfi/teg/kanal/platforma), strategiya (hammasi birdan / bosqichli to'lqinlar), jadval, maintenance window, avtomatik to'xtatish (failure threshold), har qurilma bo'yicha holat, rollback, maker-checker tasdiqlash. **P0–P8: deployment yozuvi, tasdiq va natijani qo'lda belgilash; agent orqali avtomatik yetkazish — P9.**
- **Files** — S3'ga to'g'ridan-to'g'ri multipart upload, SHA-256, antivirus skan, versiyalar, entity'larga biriktirish (mijoz/loyiha/invoice/release), papkalar, presigned yuklab olish, audit.
- **Notifications** — event → qoida → kanal (in-app, email, Telegram; keyin SMS), shablonlar (uz/ru/en), foydalanuvchi sozlamalari, retry/DLQ, Telegram'ni akkauntga ulash.
- **Users, Roles & Permissions** — xodimlarni taklif qilish, 2FA, sessiyalar, rollar (system + custom), `resource:action` ruxsatlar, scope (global/loyiha/mijoz), maker-checker, portal foydalanuvchilari va ularning rollari.
- **Audit Logs** — append-only, tamper-evident (hash-chain seal), before/after diff (redacted), filtrlash, eksport, saqlash muddati.

### 1.3 Nofunksional talablar (maqsadli ko'rsatkichlar)
| Soha | Talab |
|---|---|
| Data integrity | Moliyaviy yozuvlar hech qachon o'chirilmaydi (faqat void/reversal); DB-level FK/CHECK/UNIQUE; idempotency; optimistic locking; gapless invoice raqamlari |
| Security | OWASP ASVS L2; server to'liq buzilganda ham qurilmalarga zararli update yuborib bo'lmasin (offline imzo kalitlari); 2FA; tenant izolyatsiyasi (portal) |
| Performance | Admin API p95 < 300 ms (ro'yxatlar), dashboard < 1.5 s; 10 000 qurilma × 60 s heartbeat (~170 rps) bitta agent-gateway instansida |
| Availability | Lokal bosqichda — bitta server; VPS deploy'dan keyin 99.5%; agentlar server o'chiq bo'lsa ham ishlashda davom etadi |
| Backup | RPO ≤ 15 daqiqa (PITR), RTO ≤ 4 soat; oylik restore mashqi |
| Maintainability | Modular monolith, modul chegaralari lint bilan majburlanadi, 80%+ domain coverage, ADR'lar |
| Extensibility | Port/adapter (gateway, storage, notification kanallari), event-driven modul integratsiyasi, versiyalangan API |
| i18n | UI va shablonlar: uz (lotin, default), ru, en; vaqt zonasi default `Asia/Tashkent` |
| Compliance | O'zR "Shaxsga doir ma'lumotlar to'g'risida"gi qonun — fuqarolar PD'si O'zbekiston hududida saqlanishi talabi; **VPS tanlanganda** yurist bilan tasdiqlanadi |

### 1.4 Taxminlar (assumptions)
1. Tizim bitta kompaniya uchun (single-tenant ichki tizim); "tenant" = portal darajasida mijoz izolyatsiyasi.
2. "Projects" = dasturiy loyiha (AI, avtomatizatsiya, hisobot …), bir yoki bir nechta **komponentdan** iborat. Task/sprint boshqaruvi (Jira-o'xshash) **scope'ga kirmaydi** — tashqi tizimga havola bilan.
3. Asosiy (reporting) valyuta — UZS; USD invoice'lar UZS'da kurs bo'yicha to'lanishi mumkin. Rezidentlik bo'yicha valyuta qoidalari — firma ro'yxatdan o'tgach.
4. Billing oylik (lekin model har qanday intervalni qo'llab-quvvatlaydi: quarter/year).
5. Hozircha **yuridik shaxs yo'q**: QQS 0 (`vatRateBp` default 0); e-faktura, fiskal chek (IKPU), 1C eksport va Payme/Click/Uzum — **integratsiya bosqichida** (portlar va schema tayyor).
6. Qurilmada litsenziya bloklash (subscription to'lanmasa dasturni to'xtatish) v1 da yo'q; v1 da obuna holati faqat **update'larni** cheklaydi. Imzolangan "entitlement token" kengaytmasi arxitekturada rejalashtirilgan.
7. Jamoa: 2–3 full-stack dasturchi + 1 Go/agent dasturchi (roadmap muddatlari shunga nisbatan).
8. **Lokal-first:** tizim avval lokal serverda ishlaydi; mukammallashtirish va optimallashtirishdan keyin VPS'ga deploy qilinadi (hosting o'shanda tanlanadi).
9. Mavjud ma'lumot yo'q — migratsiya o'rniga **demo ma'lumot generatori** (seed).
10. Qurilma tomoni: P0–P8 da faqat reyestr va qo'lda kuzatuv. Agent (P9) — avval imzolangan fayl yetkazish va ishga tushirish; ESP32, Docker, AI modellar — ehtiyojga qarab ([04-update-agent.md](04-update-agent.md) maqsadli dizayn).

### 1.5 Scope tashqarisi (birinchi ishlaydigan versiya)
Task management, HR/oylik, ombor/inventar, to'liq buxgalteriya (1C o'rnini bosish), loyihalarning o'z kodi va infratuzilmasi (ular ADS-ERP'dan mustaqil). **Keyin:** qurilma agenti (P9), Payme/Click/Uzum, e-faktura, fiskal chek/IKPU, 1C eksport, SMS (P10). Android — kerak emas.

## 2. Texnologiyalar steki

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | tez, deterministik, cache; FE/BE umumiy paketlar |
| Til | **TypeScript 5 (strict)** hamma joyda (agentdan tashqari) | tiplar xavfsizligi, umumiy kontraktlar |
| Backend framework | **NestJS 11 + Fastify adapter** | modul tizimi, DI, guard/interceptor — katta jamoada maintainability; Fastify — tezlik |
| Validatsiya/kontrakt | **Zod** (`packages/contracts`) → `nestjs-zod` → **OpenAPI 3.1** | yagona schema: BE validatsiya, FE formalar, OpenAPI, Go client |
| ORM / DB | **Prisma ORM 7** (multi-file schema, `@prisma/adapter-pg`) + **PostgreSQL 17/18** | type-safe, migratsiyalar; PG: JSONB, partitioning, RLS, `pg_trgm`, `btree_gist` |
| Cache / Queue | **Redis 7 (yoki Valkey 8) + BullMQ** | job'lar, scheduler, rate-limit, sessiya cache, online-status |
| Object storage | **S3-compatible** (prod: UZ data-center S3 yoki self-hosted SeaweedFS/Garage; dev: MinIO) | `StoragePort` orqali almashtiriladi |
| Antivirus | **ClamAV** (clamd, worker ichida) | yuklangan fayllarni skan qilish |
| Auth | O'zimizning Auth moduli: **Argon2id**, **TOTP** (otplib), **Passkeys** (`@simplewebauthn/server`), server-side sessiya (httpOnly `__Host-` cookie) | ikki realm (staff/portal) ustidan to'liq nazorat |
| Authorization | **CASL** (`@casl/ability` + `@casl/prisma`) | BE va FE'da bir xil qoida; shartlar → Prisma `where` |
| Real-time | **SSE** (admin/portal: bildirishnoma, qurilma statusi, deployment progress) | oddiy, HTTP/2 bilan yaxshi, proxy-friendly |
| Email | **Nodemailer (SMTP) + React Email** shablonlar | provider-agnostic |
| Telegram | **grammY** (webhook + secret token) | zamonaviy TS bot framework |
| PDF / Excel | **Playwright (headless Chromium)** — invoice PDF; **exceljs** — XLSX | HTML/React shablondan sifatli PDF |
| Logging / Tracing | **pino** + **OpenTelemetry** → Grafana (Loki/Tempo/Prometheus); xatolar — **Sentry/GlitchTip** | korrelyatsiya ID bilan uchidan-uchiga kuzatuv |
| Frontend | **React 19 + Vite 6 + TanStack Router + TanStack Query v5 + TanStack Table** | type-safe routing (URL'da filtrlar), server-state cache |
| UI | **shadcn/ui (Radix) + Tailwind CSS v4**, lucide-react, cmdk, sonner, Recharts (shadcn charts) | eng zamonaviy, accessible, dark/light, design tokens |
| Formalar | **React Hook Form + Zod** (contracts'dan) | BE bilan bir xil validatsiya |
| API client | **orval** (OpenAPI → TanStack Query hooks) | qo'lda yozilgan fetch yo'q |
| i18n | **i18next** (uz/ru/en) | |
| Agent (P9, keyin) | **Go 1.24+**: **go-tuf v2** (TUF klient), `kardianos/service`, `golang.org/x/sys/windows`, `google/certtostore` (CNG/TPM), `go-tpm`, **bbolt** (jurnal), `go-jose`; **nfpm** (.deb/.rpm), **WiX** (MSI) | ~10 MB binary, cross-compile, OS servis; Win10/Server 2016+ |
| Release imzolash (P9) | **TUF** (root/targets offline YubiKey, delegated rollar CI KMS + YubiKey), `ads-cli`, izolyatsiyalangan `tuf-signer` | server buzilsa ham zararli update imkonsiz (8.5) |
| ESP32 firmware SDK (keyin, ehtiyojga qarab) | **ESP-IDF (C)**: `esp_https_ota`, Secure Boot V2, flash encryption, mbedTLS (ES256), A/B OTA partition + rollback | MCU'da Go agent ishlamaydi |
| Konteynerlar (keyin, ehtiyojga qarab) | **Docker Engine + Compose v2**, NVIDIA Container Toolkit (GPU), xususiy OCI registry, image'lar **digest** bilan pin | VPS va GPU server komponentlari |
| Android agent | Kerak emas (foydalanuvchi qarori) | — |
| Test | Vitest, Testcontainers (PG/Redis), Supertest, Playwright (E2E), MSW, Go `testing` + fuzz | |
| CI/CD | GitHub Actions (yoki GitLab CI): lint → typecheck → test → build → Trivy → SBOM → deploy | |
| Deploy | Docker images (distroless, non-root) + **Docker Compose** + **Caddy** — avval lokal server, keyin VPS | keyin k3s'ga ko'chirish oson |
| Xavfsizlik skanerlari | gitleaks, Semgrep/CodeQL, osv-scanner, govulncheck, Trivy, Renovate | supply-chain |

**Nega microservice emas:** jamoa kichik, moliyaviy operatsiyalar bir nechta modulni bitta ACID tranzaksiyada o'zgartiradi (invoice + ledger + audit). Modular monolith kuchli consistency beradi, chegaralar esa keyinchalik servisni ajratib olishga imkon qoldiradi (birinchi nomzodlar: agent-gateway, notifications).
