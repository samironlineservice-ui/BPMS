# ADR-0013: Deploy — avval lokal, keyin VPS (Docker Compose + Caddy)

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [01-system-architecture.md §3.2](../architecture/01-system-architecture.md), [06-cross-cutting.md §10.4, §10.7](../architecture/06-cross-cutting.md)

## Kontekst
Foydalanuvchi qarori: **avval ishlaydigan tizim (lokal), mukammallashtirish va optimallashtirish, keyin VPS deploy**; hosting hali tanlanmagan. Kichik jamoa; production'da maqsadli availability 99.5%; shaxsga doir ma'lumotlarni O'zbekistonda saqlash talabi (yurist bilan tasdiqlanadi).

## Qaror
- Bitta server (keyin 2+): Docker Compose, **Caddy** (auto-TLS, host routing, rate-limit), PgBouncer, PostgreSQL + pgBackRest (PITR, off-site), Redis, S3-compatible storage, ClamAV, OTel → Grafana stek.
- Host'lar: `admin.`, `portal.`, `agent.`, `pay.`, `files.` — har biri alohida CSP, rate-limit va auth.
- P0–P7: xuddi shu compose **lokal serverda** (dev va prod farqi minimal; kunlik `pg_dump`).
- **P8:** VPS — O'zbekistondagi data-center tavsiya (PD lokalizatsiyasi); o'shanda tanlanadi.
- Kubernetes (k3s) — yuklama va jamoa o'sganda alohida ADR bilan.

## Oqibatlar
- ✅ Oddiy operatsiya, tez tiklash (RTO ≤ 4 soat, RPO ≤ 15 daq).
- ⚠️ v1 da bitta server — SPOF; agentlar server o'chiqligiga chidamli (G4), backup/restore mashqlari majburiy.

## Muqobillar
- **Kubernetes darhol** — kichik jamoa uchun ortiqcha murakkablik.
- **Xorijiy cloud** — PD lokalizatsiyasi talabiga zid bo'lishi mumkin.
