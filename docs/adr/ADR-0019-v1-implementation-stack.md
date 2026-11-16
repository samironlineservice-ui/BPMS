# ADR-0019: v1 amalga oshirish — stek va muhit aniqlashtirishlari

> [ADR indeksi](README.md) · Holat: **Qabul qilingan** (2026-11-11) · ADR-0002 va ADR-0009'ning texnik tafsilotlarini aniqlashtiradi

## Kontekst

Kod yozish boshlanganda (P0–P6) quyidagi real cheklovlar aniqlandi:

- Ishlab chiqish kompyuterida Docker va sudo yo'q, corepack/pnpm o'rnatilmagan.
- Protsessor (Intel i5-2400) **AVX2'ni qo'llamaydi**. Rolldown asosidagi Vite 8 va `@tailwindcss/vite` "Illegal instruction" bilan qulaydi.
- Foydalanuvchi qarori: avval ishlaydigan sayt (ADR-0017, ADR-0018). Hozirgi hajmda Redis'siz ham ishonchli navbat qurish mumkin.

## Qarorlar

| # | Qaror | Sabab |
|---|---|---|
| 1 | **npm workspaces** (`packages/*`, `apps/*`) | pnpm/corepack yo'q; npm workspaces yetarli |
| 2 | **TypeScript 7** (native kompilyator), **NestJS 12 + Fastify**, **Prisma 7.10** (`prisma-client` generator, `@prisma/adapter-pg`) | Tez build, ESM; decorator metadata tekshirilgan |
| 3 | Lokal DB — **embedded-postgres 18.6** (`npm run db:start`, ma'lumotlar `.data/pg`) | Docker'siz haqiqiy PostgreSQL (RLS, trigger, EXCLUDE — hammasi) |
| 4 | **v1 da Redis/BullMQ yo'q**: transactional outbox → worker'dagi relay (`FOR UPDATE SKIP LOCKED`), cron — **croner**, har ish `pg_try_advisory_xact_lock` bilan | Bitta kamroq servis; bir nechta worker bo'lsa ham dublikat ish yo'q. Hajm oshsa — BullMQ qo'shiladi (outbox o'zgarmaydi) |
| 5 | **Vite 7.3.8** (ildizda `devDependency` + `overrides`), Tailwind 4 **`@tailwindcss/postcss`** orqali | Rolldown/Vite 8 bu CPU'da ishlamaydi. Butun monorepo bitta Vite 7 dan foydalanadi |
| 6 | Fayllar — **lokal disk adapteri** (`var/storage`): `.part` → atomik rename, SHA-256, turi magic-bytes bo'yicha, yuklab olish audit qilinadi | S3-compatible adapter VPS bosqichida (`StorageService` interfeysi saqlanadi) |
| 7 | Qo'lda yuritiladigan reliz bosqichi: **READY = `tuf_role_version = 0`** (TUF imzosiz, artefakt hash'lari tekshirilgan). Agent (P9) faqat `> 0` ni qabul qiladi | Agent hali yo'q; reyestr va deployment rejasi hozirdan ishlaydi |
| 8 | Relizdagi SoD CHECK (`published_by ≠ created_by`) olib tashlandi — **migratsiya 0005** | Kichik jamoa: rahbar o'zi yaratgan relizni chiqara oladi. Boshqaruv — `deployments.production` tasdig'i; kod yaxlitligi — P9'da TUF threshold |
| 9 | "Keyingi davrdan" tarif o'zgarishi — **`subscriptions.pending_change` (JSONB)**, billing run davr chegarasida qo'llaydi — **migratsiya 0004** | Revision'lar append-only (`valid_to` faqat bir marta yopiladi), shuning uchun kelajakdagi revision oraliq holat o'zgarishlariga to'sqinlik qiladi |
| 10 | Global seriyalar (CL-, SUB-, DV-) uchun `document_sequences.year = 0` — **migratsiya 0003** | Yillik (INV-2026-…) va global raqamlash bitta jadvalda |
| 11 | Mijoz kabineti — **alohida ilova** `apps/portal-web` (:5174): alohida cookie (`ads_psid`), `app_portal` roli + RLS. Har sirt faqat o'z origin'idan qabul qilinadi (CSRF) | IDOR/BOLA'ga qarshi uch qatlam: sessiyadagi `clientId`, RLS, origin |
| 12 | Bildirishnomalar: tizim ichida (qo'ng'iroqcha) + **Telegram** (grammy, long polling, faqat worker'da). `TELEGRAM_BOT_TOKEN` bo'lmasa o'chiq | Lokal muhitda webhook uchun ommaviy URL yo'q |
| 13 | Invoice PDF — **pdfmake 0.3** (Roboto, tashqi URL taqiqlangan). Birinchi so'rovda yaratiladi va o'zgarmas fayl sifatida saqlanadi (5 yil) | Yuridik hujjat: chiqarilgan paytdagi holat |
| 14 | Pulni ko'rsatish Intl lokaliga bog'liq emas (`1 500 000,00 so'm`, `$1,250.00`) | Chrome'da `uz-UZ` lokali yo'q — natija brauzer va Node'da bir xil bo'lishi kerak |
| 15 | Demo tarix — haqiqiy servislar orqali, "bugun" seed davomida simulyatsiya qilinadi (`setTodayOverride`, faqat seed) | Ledger, MRR, dunning, oy yopish — hammasi haqiqiy qoidalar bilan hosil bo'ladi |
| 16 | Lokal ishlashda TOTP'ni vaqtincha o'chirish: `.env` → `MFA_ENABLED=false` (foydalanuvchi so'rovi, 2026-11-11). Production'da e'tiborga olinmaydi; o'chiq paytda sessiyaga MFA tasdig'i yozilmaydi | ADR-0003 (majburiy TOTP) serverda o'zgarmaydi; lokal sinov qulayligi |

## Oqibatlar

- Lokal ishga tushirish: `npm install && npm run db:start && npm run db:migrate && npm run seed && npm run dev`. Docker kerak emas.
- VPS bosqichida (P8) oddiy PostgreSQL ishlatiladi (embedded emas), Caddy va systemd yoki Docker Compose bilan. Redis ixtiyoriy.
- Vite 8 ga o'tish faqat AVX2'li build mashinasida (CI/VPS) mumkin. Shungacha `overrides` saqlanadi.
- `pending_change` va `tuf_role_version = 0` qoidalari [CLAUDE.md](../../CLAUDE.md) da ham qayd etilgan.

## Muqobillar

- **Docker Compose (PostgreSQL + Redis)** — mashinada Docker yo'q. VPS'da qo'llaniladi.
- **BullMQ hozirdan** — hozirgi hajmda ortiqcha servis. Outbox dizayni keyinroq qo'shishga imkon beradi.
- **Kelajakdagi revision'lar bilan rejalashtirish** — append-only qoidasi bilan ziddiyatli (9-band).
