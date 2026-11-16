# ADR-0009: Transactional outbox + idempotent consumer'lar

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [01-system-architecture.md §3.5](../architecture/01-system-architecture.md), [02-modules.md §4.4](../architecture/02-modules.md)

## Kontekst
Biznes o'zgarishi va uning yon ta'sirlari (bildirishnoma, entitlement keshi, analitika) bir-biriga mos bo'lishi kerak: "DB'ga yozildi, lekin xabar ketmadi" yoki aksi bo'lmasligi kerak.

## Qaror
- Event biznes o'zgarish bilan **bitta tranzaksiyada** `outbox_events` ga yoziladi (`eventKey` unique — retry'da dublikat yo'q).
- Worker relay → BullMQ; consumer'lar `processed_events(consumer, event_id)` bilan idempotent.
- Tashqi I/O (Telegram, email, gateway) hech qachon DB tranzaksiyasi ichida emas.

## Oqibatlar
- ✅ At-least-once yetkazish + idempotent qayta ishlash = amalda exactly-once ta'sir.
- ⚠️ Outbox lag monitoringi kerak (alert > 1 daq).

## Muqobillar
- **To'g'ridan-to'g'ri BullMQ'ga yozish** — DB commit va navbat orasida nomuvofiqlik xavfi.
