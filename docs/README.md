# ADS-ERP — Arxitektura hujjatlari

> **Holat (2026-11-11):** arxitektura **v3**; sayt qismi (**P0–P6**) amalga oshirilgan — ishga tushirish: [../README.md](../README.md). Amalga oshirishdagi aniqlashtirishlar: [ADR-0019](adr/ADR-0019-v1-implementation-stack.md).

**ADS-ERP — kompaniya uchun menejment tizimi (sayt):** mijozlar, loyihalar (M:N) va ularning qismlari, oylik obunalar, to'lovlar va moliya (UZS + USD), rahbar tasdiqlari, mijozlar portali, Telegram bildirishnomalari, hamda **qaysi mijozda, qaysi qurilmada (kompaniya VPS'i, server, GPU, Raspberry Pi, ESP32) qaysi versiya ishlayotganini** kuzatish. Loyihalarning o'z kodi (AI, avtomatizatsiya, firmware …) ADS-ERP'dan **mustaqil**.

Ustuvorliklar: **data integrity → security → maintainability → extensibility**.
Tartib: **I. Sayt (lokal, ishlaydigan tizim) → II. Mukammallashtirish va optimallashtirish → III. VPS deploy → IV. Qurilma agenti va integratsiyalar.**

## Hujjatlar xaritasi
| Hujjat | Mazmuni | Reja bo'limi |
|---|---|---|
| [architecture/00-overview.md](architecture/00-overview.md) | Kontekst, qarorlar, aktorlar, talablar, taxminlar, scope, texnologiyalar steki | 0–2 |
| [architecture/01-system-architecture.md](architecture/01-system-architecture.md) | C4 context/container, deploy topologiyasi (lokal → VPS), monorepo, modul tuzilmasi, patternlar | 3 |
| [architecture/02-modules.md](architecture/02-modules.md) | 15 modul, egalik qiladigan jadvallar, bog'liqlik grafi, kontraktlar, event katalogi | 4 |
| [architecture/database/er-diagrams.md](architecture/database/er-diagrams.md) | ER diagrammalar | 5 |
| [architecture/database/prisma-schema.md](architecture/database/prisma-schema.md) | **To'liq Prisma schema** (86 model) + konvensiyalar — tekshirilgan | 6 |
| [architecture/database/integrity.sql](architecture/database/integrity.sql) | CHECK, EXCLUDE, trigger'lar, tasdiqlash huquqi, davr qulfi, partitioning, huquqlar, portal RLS | 6–7 |
| [architecture/database/integrity-tests.md](architecture/database/integrity-tests.md) | 115 ta integrity testi natijasi, drift tekshiruvi | — |
| [architecture/03-billing-finance.md](architecture/03-billing-finance.md) | Pul modeli, obunalar, billing, FX va oy oxiri qayta baholash, ledger, rahbar tasdig'i, gateway'lar (P10) | 7 |
| [architecture/04-update-agent.md](architecture/04-update-agent.md) | Qurilma agenti — **maqsadli dizayn (P9)** | 8 |
| [architecture/05-security.md](architecture/05-security.md) | Auth, RBAC + scope + CASL (Rahbar, Menejer, ruxsat berish), portal izolyatsiyasi, threat model | 9 |
| [architecture/06-cross-cutting.md](architecture/06-cross-cutting.md) | Audit, bildirishnomalar, observability, backup, frontend va dizayn tizimi, testlar, CI/CD | 10 |
| [roadmap.md](roadmap.md) | P0–P10, milestone'lar M1–M4 | 11 |
| [acceptance-criteria.md](acceptance-criteria.md) | Umumiy DoD + har bosqich uchun acceptance criteria | 12 |
| [risks-and-open-questions.md](risks-and-open-questions.md) | Qabul qilingan qarorlar va risklar | 13 |
| [adr/](adr/README.md) | 20 ta Architecture Decision Record | — |

## Asosiy qarorlar (qisqa)
- **Faqat menejment; sayt avval, qurilma agenti keyin** — [ADR-0018](adr/ADR-0018-management-scope-device-agent-later.md), [ADR-0017](adr/ADR-0017-phasing-working-system-first.md)
- **Modular monolith** (NestJS 11 + Fastify) — [ADR-0001](adr/ADR-0001-modular-monolith.md); **Prisma 7.10 + PostgreSQL**, React 19 + TanStack + shadcn/ui — [ADR-0002](adr/ADR-0002-core-stack.md)
- **Server-side sessiyalar**, majburiy TOTP — [ADR-0003](adr/ADR-0003-authentication.md); **RBAC + scope + CASL**, portal RLS; **rahbar ruxsatni menejerga beradi** (doimiy/muddatli) — [ADR-0004](adr/ADR-0004-authorization.md)
- **Moliyaviy yaxlitlik DB darajasida**, rahbar tasdig'i, oy yopilishi — [ADR-0012](adr/ADR-0012-db-level-financial-integrity.md); BigInt pul — [ADR-0010](adr/ADR-0010-money-bigint.md); obuna tarixi — [ADR-0011](adr/ADR-0011-subscription-revisions.md); outbox — [ADR-0009](adr/ADR-0009-transactional-outbox.md)
- **Loyiha komponentlari, qurilma sinflari, kompaniya VPS'ida bir nechta mijoz instansi** — [ADR-0014](adr/ADR-0014-components-and-device-classes.md)
- **Avval lokal, keyin VPS** — [ADR-0013](adr/ADR-0013-deployment-v1.md)
- Qurilma agenti (P9) uchun maqsadli dizayn: Go agent, TUF (3 kishi, 2-of-3), ESP32, Docker/AI — [ADR-0005](adr/ADR-0005-go-update-agent.md)–[0008](adr/ADR-0008-desired-state.md), [0015](adr/ADR-0015-esp32-firmware-ota.md), [0016](adr/ADR-0016-containers-and-ai-models.md)

## Tekshiruv holati
- Prisma schema: `prisma validate` ✅ (Prisma CLI 7.10.1) — 86 model, 136 foreign key.
- Schema + `integrity.sql` PostgreSQL 18.6 da: **115/115 test o'tdi** (ikki marta billing yo'q, ortiqcha taqsimlash yo'q, rahbar tasdig'i va menejerga muddatli ruxsat, qurilma/instans mosligi, oy yopilishi, portal RLS va h.k.).
- Prisma drift: `integrity.sql` qo'llangan bazaga nisbatan **bo'sh diff**.

## Ochiq savollar
Sayt bosqichini to'xtatadigan savol yo'q. Qurilma agenti (P9) va integratsiyalar (P10) tafsilotlari o'sha bosqichlar boshida muhokama qilinadi.

## Keyingi qadam — P0 Foundation (sayt)
- Monorepo, lokal docker compose (PostgreSQL, Redis, MinIO), CI, `packages/db` (shu schema + integrity.sql + 115 test), NestJS `api` + `worker`, admin sayt shell'i va dizayn tizimi, demo ma'lumotlar.
- Muhit: Docker + Compose kerak (hozir mashinada yo'q), pnpm (corepack), Git repo.
