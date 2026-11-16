# Architecture Decision Records (ADR)

> [Hujjatlar indeksi](../README.md)

Har bir muhim arxitektura qarori alohida ADR sifatida yoziladi: **kontekst → qaror → oqibatlar → muqobillar**. Qaror o'zgarsa, eski ADR o'chirilmaydi — yangi ADR uni "Superseded by ADR-XXXX" deb belgilaydi.

| # | Qaror | Holat |
|---|---|---|
| [0001](ADR-0001-modular-monolith.md) | Modular monolith (NestJS), 3 process turi | Qabul qilingan |
| [0002](ADR-0002-core-stack.md) | Asosiy stek: NestJS 11 + Fastify, Prisma 7.10, PostgreSQL, Redis/BullMQ, React 19 | Qabul qilingan — v1 tafsilotlari [0019](ADR-0019-v1-implementation-stack.md) da |
| [0003](ADR-0003-authentication.md) | Server-side sessiyalar, majburiy TOTP, passkey'lar | Qabul qilingan |
| [0004](ADR-0004-authorization.md) | RBAC + scope + CASL; portal uchun PostgreSQL RLS | Qabul qilingan |
| [0005](ADR-0005-go-update-agent.md) | Update agent Go'da (supervisor + A/B); ESP32 — firmware SDK; Android — keyinroq | Qabul qilingan (v2 yangilangan) |
| [0006](ADR-0006-tuf-release-signing.md) | Release imzolash: to'liq TUF, offline kalitlar (3 kishi, 2-of-3) | Qabul qilingan (v2 yangilangan) |
| [0007](ADR-0007-device-authentication.md) | Qurilma autentifikatsiyasi: ES256 imzolangan so'rovlar | Qabul qilingan |
| [0008](ADR-0008-desired-state.md) | Imzolangan desired-state + allowlist buyruqlar | Qabul qilingan |
| [0009](ADR-0009-transactional-outbox.md) | Transactional outbox + idempotent consumer'lar | Qabul qilingan |
| [0010](ADR-0010-money-bigint.md) | Pul: BigInt minor units, FX snapshot | Qabul qilingan |
| [0011](ADR-0011-subscription-revisions.md) | Obunalar: SubscriptionRevision (temporal model) | Qabul qilingan |
| [0012](ADR-0012-db-level-financial-integrity.md) | Moliyaviy yaxlitlik DB darajasida (append-only, trigger, ledger, davr qulfi, rahbar tasdig'i) | Qabul qilingan (v2 yangilangan) |
| [0013](ADR-0013-deployment-v1.md) | Deploy: avval lokal, keyin VPS (Docker Compose + Caddy) | Qabul qilingan (v2 yangilangan) |
| [0014](ADR-0014-components-and-device-classes.md) | Ko'p komponentli loyihalar, qurilma sinflari va egaligi | Qabul qilingan (v2) |
| [0015](ADR-0015-esp32-firmware-ota.md) | ESP32: Secure Boot V2 + imzolangan firmware OTA | Maqsadli dizayn — kechiktirilgan (P9) |
| [0016](ADR-0016-containers-and-ai-models.md) | Docker Compose komponentlari va AI model artefaktlari | Maqsadli dizayn — kechiktirilgan (P9) |
| [0017](ADR-0017-phasing-working-system-first.md) | Bosqichlash: avval sayt (ishlaydigan tizim), keyin agent va integratsiyalar | Qabul qilingan (v3 aniqlashtirilgan) |
| [0018](ADR-0018-management-scope-device-agent-later.md) | ADS-ERP faqat menejment; qurilma qismi — avval reyestr, agent keyin | Qabul qilingan (v3) |
| [0019](ADR-0019-v1-implementation-stack.md) | v1 amalga oshirish: npm workspaces, TS7, NestJS 12, embedded PostgreSQL, Redis'siz outbox, Vite 7 (AVX2), portal ilovasi | Qabul qilingan (2026-11-11) |
| [0020](ADR-0020-client-portal-roles-requests.md) | Mijoz kabineti: rollar serverda, murojaatlar (ichki izoh RLS bilan yashirin), akt-sverka PDF | Qabul qilingan (2026-11-11) |
| [0021](ADR-0021-online-payments-gateways.md) | Onlayn to'lovlar: Payme, Click, Uzum, Paynet (haqiqiy protokol + emulyator), oylik/yillik obunani sotib olish, kartalar (faqat token), avtomatik to'lov | Qabul qilingan (2026-11-11) |
