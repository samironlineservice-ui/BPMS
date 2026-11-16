# ADR-0017: Bosqichlash — avval ishlaydigan tizim, integratsiyalar keyin

- **Holat:** Qabul qilingan (2026-11-10, v2; v3 da aniqlashtirildi) — foydalanuvchi qarori
- **Bog'liq:** [roadmap.md](../roadmap.md), [acceptance-criteria.md](../acceptance-criteria.md)

## Kontekst
Hozircha yuridik shaxs yo'q; Payme/Click/Uzum merchant akkauntlari, e-faktura, fiskalizatsiya, 1C hozir kerak emas. Hosting ham hali tanlanmagan.

## Qaror
- Tartib (v3): **I. Sayt — ishlaydigan menejment tizimi (lokal, P0–P6) → II. Mukammallashtirish va optimallashtirish (P7) → III. VPS deploy (P8) → IV. Qurilma agenti (P9) va integratsiyalar (P10, firma ochilgach).**
- To'lovlar hozircha qo'lda kiritiladi va rahbar tasdiqlaydi; QQS 0.
- Integratsiyalar uchun schema, portlar va DB qoidalari **hozirdan tayyor** (gateway jadvallari, `vatRateBp`, `ikpuCode`, `isResident`) — keyin qayta loyihalash kerak bo'lmaydi.

## Oqibatlar
- ✅ Tezroq ishlaydigan tizim; xavfli tashqi bog'liqliklar keyinga.
- ⚠️ Integratsiya bosqichida yuridik talablar o'zgarishi mumkin → P10 boshida yurist/buxgalter review.

## Muqobillar
- **Hammasini birdaniga (v1 da gateway'lar bilan)** — merchant akkauntlarsiz sinab bo'lmaydi.
