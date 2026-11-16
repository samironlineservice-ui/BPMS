# ADR-0002: Asosiy stek

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [00-overview.md §2](../architecture/00-overview.md)

## Kontekst
Foydalanuvchi talabi: NodeJS + ReactJS; qolgan texnologiyalar — eng zamonaviy va barqaror.

## Qaror
- **Backend:** TypeScript 5 (strict), NestJS 11 + Fastify adapter, Zod (`packages/contracts`) → `nestjs-zod` → OpenAPI 3.1.
- **ORM/DB:** Prisma ORM **7.10.x** (pin; multi-file schema, `partialIndexes` preview), PostgreSQL 17/18 (tekshiruv PostgreSQL 18.6 da o'tkazildi).
- **Navbat/kesh:** Redis 7 (yoki Valkey 8) + BullMQ.
- **Frontend:** React 19 + Vite + TanStack Router/Query/Table, shadcn/ui + Tailwind v4, React Hook Form + Zod, i18next (uz/ru/en), orval (OpenAPI → hooks).
- **Monorepo:** pnpm workspaces + Turborepo.

## Oqibatlar
- ✅ FE va BE bir xil Zod schema'lardan foydalanadi; OpenAPI Go agent uchun ham kontrakt.
- ⚠️ Prisma CHECK/EXCLUDE/trigger'ni ifoda qila olmaydi → raw SQL ([integrity.sql](../architecture/database/integrity.sql)); drift tekshiruvi bilan xavfsiz ekani isbotlandi.
- ⚠️ Prisma 8 hozircha RC (2026-11) — 7.10.x da qolamiz; 8.x barqaror bo'lgach alohida ADR bilan ko'chish baholanadi.
- ⚠️ Prisma 7 `migrate diff` uchun `prisma.config.ts` da `datasource.url` majburiy (aks holda bo'sh natija).

## Muqobillar
- **Drizzle / Kysely** — kuchli SQL nazorati, lekin foydalanuvchi Prisma'ni so'ragan; Prisma TypedSQL murakkab so'rovlar uchun yetarli.
- **tRPC** — Go agent uchun REST/OpenAPI kontrakt baribir kerak, shuning uchun yagona REST + OpenAPI tanlandi.
