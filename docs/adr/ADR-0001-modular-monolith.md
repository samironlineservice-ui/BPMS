# ADR-0001: Modular monolith (NestJS), 3 process turi

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [01-system-architecture.md](../architecture/01-system-architecture.md), [02-modules.md](../architecture/02-modules.md)

## Kontekst
13 ta biznes moduli, kichik jamoa (3 FS + 1 Go). Moliyaviy amallar bir nechta modulni bitta tranzaksiyada o'zgartiradi (invoice + ledger + audit + outbox). Ustuvorlik: data integrity → security → maintainability → extensibility.

## Qaror
- Bitta NestJS kod bazasi (`apps/server`), 15 ta bounded-context modul, **uchta process turi**: `api` (admin + portal + webhook'lar), `agent-gateway` (faqat agent API — admin modullari yuklanmaydi), `worker` (BullMQ, scheduler, outbox relay).
- Modul chegaralari `dependency-cruiser` bilan CI'da majburlanadi: faqat `index.ts` facade import qilinadi; har jadvalning bitta egasi; sikl taqiqlangan.
- Modullararo: sinxron facade — faqat bitta tranzaksiya kerak bo'lsa; qolgani — domain event + outbox.

## Oqibatlar
- ✅ ACID tranzaksiyalar modullar bo'ylab; oddiy deploy va debugging; bitta Docker image.
- ✅ Keyinchalik servisga ajratish oson (birinchi nomzodlar: agent-gateway, notifications).
- ⚠️ Chegaralarni intizom va CI ushlab turadi — buzilsa "big ball of mud" xavfi.

## Muqobillar
- **Microservices** — rad etildi: distributed transactions/saga moliyaviy yaxlitlikni murakkablashtiradi, jamoa kichik, operatsion xarajat yuqori.
- **Bitta process** — rad etildi: agent API'ni admin modullaridan ajratish xavfsizlik va masshtab uchun muhim.
