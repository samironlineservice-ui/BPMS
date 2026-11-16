# ADR-0005: Update agent Go'da (supervisor + A/B); ESP32 — firmware SDK; Android — keyinroq

- **Holat:** Qabul qilingan (2026-11-10) — tilni foydalanuvchi tanlagan; v2: qurilmalar ro'yxati aniqlashtirildi
- **Bog'liq:** [04-update-agent.md §8.2, §8.9–8.12](../architecture/04-update-agent.md)

## Kontekst
Qurilmalar (aniqlashtirilgan): VPS, oddiy server (Core i3), GPU server, Raspberry Pi — Linux/Windows, x64/ARM — va ESP32 mikrokontrollerlar. Agent OS servisi sifatida doim ishlaydi, o'zini xavfsiz yangilashi va noto'g'ri build'dan avtomatik tiklanishi kerak.

## Qaror
- **Go 1.24+**: ~10 MB statik binary, ~15 MB RAM, oson cross-compile (windows/amd64, linux/amd64/arm64/armv7).
- **Supervisor + A/B slot:** kichik, kam o'zgaradigan `ads-supervisor` OS servisi; agent core A/B slotlardan ishlaydi, trial-commit (10 daq, 3 urinish), aks holda avtomatik revert.
- Lokal jurnal — bbolt (crash-safe davom/rollback).
- Build matritsasi: windows/amd64, linux/amd64, **linux/arm64 va linux/armv7 (Raspberry Pi)**; GPU serverda Docker/NVIDIA inventari.
- **ESP32:** Go agent ishlamaydi → ESP-IDF firmware SDK yoki gateway rejimi ([ADR-0015](ADR-0015-esp32-firmware-ota.md)).
- **Android:** hozircha rejada yo'q; kerak bo'lsa — Kotlin shell + Go core (gomobile AAR).

## Oqibatlar
- ✅ Yengil, ishonchli, bitta reference implementatsiya.
- ⚠️ Stekka ikkinchi til (Go) qo'shiladi — umumiy test vektorlar va kontrakt testlari bilan kompensatsiya.
- ⚠️ Go ≥ 1.21 **Windows 10 / Server 2016+** talab qiladi — Windows 7/8 qurilmalar uchun flot census kerak (ochiq savol).

## Muqobillar
- **Node.js (SEA)** — ~90–100 MB binary, 50+ MB RAM, Windows servis va self-update mo'rt.
- **Alohida Kotlin TUF klienti** — ikkinchi xavfsizlik-kritik implementatsiya, rad etildi.
