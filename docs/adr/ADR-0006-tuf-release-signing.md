# ADR-0006: Release imzolash — to'liq TUF, offline kalitlar

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [04-update-agent.md §8.5–8.6](../architecture/04-update-agent.md)

## Kontekst
Asosiy xavf: markaziy server yoki CI buzilsa, barcha mijoz qurilmalariga zararli kod yuborilishi (supply-chain). Talab: **server to'liq buzilsa ham yangi kod o'rnatib bo'lmasin**.

## Qaror
- **The Update Framework (TUF)**, go-tuf v2 (agent) + `ads-cli` (imzolash).
- Rollar: root (**3 kishi, 2-of-3** YubiKey, offline — tasdiqlangan), targets (2-of-3, faqat delegatsiya), `firmware` roli (ESP32 manifest kaliti + Secure Boot kaliti), loyiha delegated rollari (**2-of-2: CI KMS alohida cloud akkauntda + release manager YubiKey**), agent roli (2-of-3), snapshot/timestamp — izolyatsiyalangan `tuf-signer` (ERP'da emas).
- ERP hech qanday release private key saqlamaydi; faqat imzolangan metadata va artefaktlarni tarqatadi.
- Anti-rollback: TUF versiyalari + signed `securityFloor`; freeze: timestamp 1 kunda eskiradi; mix-and-match: snapshot.
- Windows binary'lari qo'shimcha Authenticode; APK sertifikat digest'i metadata'da pin.

## Oqibatlar
- ✅ Isbotlangan standart; kalit rotatsiyasi va kompromatdan tiklanish tartibi mavjud.
- ⚠️ Operatsion murakkablik: ceremony'lar, metadata muddatlari (muddat o'tsa update'lar to'xtaydi) → monitoring (30/14/7 kun), runbook; 3 kalit egasidan kamida 2 tasi har ceremony'da bo'lishi kerak.
- ⚠️ Har prod reliz inson tasdig'ini (YubiKey) talab qiladi.

## Muqobillar
- **O'zimiz yozgan "TUF'ga o'xshash" sxema (Ed25519 manifest)** — rad etildi: odatda root rotatsiyasi, threshold va snapshot izchilligi tushib qoladi.
- **Faqat TLS + server imzosi** — rad etildi: server buzilishiga qarshi himoya yo'q.
