# ADR-0014: Ko'p komponentli loyihalar, qurilma sinflari va egaligi

- **Holat:** Qabul qilingan (2026-11-10, v2)
- **Bog'liq:** [04-update-agent.md §8.13, §8.17](../architecture/04-update-agent.md), [prisma-schema.md](../architecture/database/prisma-schema.md)

## Kontekst
Loyihalar turlicha (AI, avtomatizatsiya, hisobot); bitta loyihaning qismlari turli joyda ishlaydi: VPS, oddiy server, GPU server, Raspberry Pi, ESP32. Kompaniya VPS'i bir nechta mijozga xizmat qilishi mumkin.

## Qaror
- `ProjectComponent` — loyiha qismi (runtime: servis, Docker Compose, statik web, desktop, AI model, firmware). **Relizlar komponent bo'yicha**; komponentlar mosligi imzolangan `requires` bilan.
- Qurilma: `deviceClass` (VPS, SERVER, GPU_SERVER, EDGE_SBC, MICROCONTROLLER, DESKTOP), `ownerType` (CLIENT | COMPANY), `managementMode` (AGENT | FIRMWARE_OTA | GATEWAY_PROXIED).
- O'rnatma = qurilmadagi komponent **instansi**: mijoz qurilmasida — o'sha mijozniki; kompaniya qurilmasida — bir nechta mijoz instansi yoki umumiy (shared) instans.
- Deployment — bitta komponent relizi; target — o'rnatma (agent self-update'da — qurilma).
- Barcha mosliklar DB'da: composite FK (reliz ↔ komponent, target ↔ o'rnatma ↔ qurilma) va trigger (egalik, platforma).

## Oqibatlar
- ✅ Real infratuzilmani aks ettiradi; entitlement har instans bo'yicha.
- ⚠️ UI va desired-state hisoblash murakkablashadi (instanslar, komponent mosligi) — P4 (reyestr) va P9 (agent) da.

## Muqobillar
- **Loyiha = bitta artefakt** — VPS + ESP32 + GPU qismlarini mustaqil yangilab bo'lmaydi.
- **Har mijozga alohida qurilma yozuvi (VPS'ni dublikat qilish)** — inventar va monitoring buziladi.
