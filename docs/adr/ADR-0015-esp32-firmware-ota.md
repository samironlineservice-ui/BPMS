# ADR-0015: ESP32 — imzolangan firmware OTA (Secure Boot V2 + manifest)

- **Holat:** Maqsadli dizayn — amalga oshirish **kechiktirilgan** (P9, ehtiyojga qarab; [ADR-0018](ADR-0018-management-scope-device-agent-later.md))
- **Bog'liq:** [04-update-agent.md §8.14](../architecture/04-update-agent.md)

## Kontekst
ESP32 mikrokontrollerda Go agent va to'liq TUF klienti ishlamaydi, lekin G1 kafolati (server buzilsa ham zararli kod o'rnatilmasin) saqlanishi kerak.

## Qaror
- **ADS firmware SDK** (ESP-IDF komponenti, C): qurilma kaliti (NVS flash encryption ostida yoki ATECC608), Go agent bilan bir xil JWS check-in, imzolangan kichik manifest, `esp_https_ota`, A/B partition + avtomatik rollback.
- **Apparat ishonch ildizi:** Secure Boot V2 + flash encryption; anti-rollback — eFuse `secure_version`.
- Ikki mustaqil imzo: manifest — `firmware` TUF delegated rol kaliti; image — Secure Boot kaliti (ikkalasi offline).
- Internetsiz ESP32 — **gateway rejimi**: o'sha mijozning agent-qurilmasi (masalan, Raspberry Pi) TUF bilan tekshirib, LAN orqali yangilaydi.

## Oqibatlar
- ✅ Mikrokontrollerda ham "server buzilsa ham zararli firmware ishlamaydi".
- ⚠️ eFuse yozuvi qaytarib bo'lmaydi → provisioning runbook, dev/production platalar ajratilgan, kalit zaxirasi 2 kishida.

## Muqobillar
- **Imzosiz HTTP OTA** — zararli firmware xavfi.
- **Har ESP32'ga Raspberry Pi** — qimmat va murakkab; faqat internetsiz joylar uchun (gateway rejimi).
