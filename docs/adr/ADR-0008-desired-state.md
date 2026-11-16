# ADR-0008: Imzolangan desired-state + allowlist buyruqlar

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [04-update-agent.md §8.8](../architecture/04-update-agent.md)

## Kontekst
Qurilmalar uzoq vaqt oflayn bo'lishi mumkin; update'lar idempotent va qayta urinishga chidamli bo'lishi kerak; masofadan boshqaruv xavfsiz bo'lishi kerak.

## Qaror
- **Deklarativ desired state** (generation bilan), control-plane kaliti bilan JWS-imzolangan; agent 60 s ± 20% check-in, generation o'zgarsa reconcile.
- Server faqat **imzolangan TUF target'larni** nomlay oladi; o'rnatish semantikasi (hook'lar, health-check) imzolangan metadata'dan.
- Buyruqlar — qat'iy enum: REFRESH, RESTART_COMPONENT, RUN_HEALTHCHECK, COLLECT_LOGS, ROTATE_KEY, PAUSE/RESUME_UPDATES. **Shell, fayl yozish, masofadan uninstall yo'q.**
- Rollout: ring 0 → 2% → 10% → 30% → 100%, avtomatik to'xtatish, maintenance window qurilmada, busy-deferral, obuna gating (SUSPENDED → faqat security update'lar).

## Oqibatlar
- ✅ Oflayn chidamlilik, idempotentlik, server buzilganda ham cheklangan zarar.
- ⚠️ Ilovalar `/.well-known/ads/health` va `/busy` endpoint'larini qo'llab-quvvatlashi kerak (mahsulot jamoalariga talab).

## Muqobillar
- **Imperativ "install X" buyruqlari** — oflayn/qayta urinishda nomuvofiqlik xavfi.
- **Masofaviy shell** — xavfsizlik nuqtai nazaridan qabul qilinmaydi.
