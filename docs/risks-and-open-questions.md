# Risklar va qarorlar

> ADS-ERP arxitektura hujjatlari · v3 (2026-11-10) · [Hujjatlar indeksi](README.md)

## 13.1 Qabul qilingan qarorlar (foydalanuvchi javoblari)
| Mavzu | Qaror | Qayerda aks etgan |
|---|---|---|
| Tizim maqsadi | **ADS-ERP faqat menejment uchun.** Loyihalar kodi (AI, avtomatizatsiya, firmware …) mustaqil ishlab chiqiladi va ishga tushiriladi | [ADR-0018](adr/ADR-0018-management-scope-device-agent-later.md) |
| Hozirgi ustuvorlik | **Sayt qismi** (menejment veb-ilovasi); qolgani keyin | [roadmap.md](roadmap.md) |
| Qurilmalar | VPS (**kompaniyaniki**), oddiy server (Core i3), GPU server, Raspberry Pi, ESP32 — birinchi versiyada **reyestr va qo'lda kuzatuv** | P4 |
| Qurilma agenti | Keyin; avval soddalashtirilgan: **faylni qurilmaga yuborish va ishga tushirish** (imzolangan fayl) | P9, [04-update-agent.md](architecture/04-update-agent.md) |
| ESP32, Docker, AI modellar | Hozir aralashilmaydi; qurilma modellarga qarab tanlanadi; ESP32 tafsilotlari keyin | P9 (ehtiyojga qarab) |
| Android | Kerak emas | — |
| To'lov va deployment tasdig'i | **Rahbar** tasdiqlaydi; rahbar ruxsatni **menejer akkauntiga** berishi mumkin (doimiy yoki muddatli) | `approverPermission`, [05-security.md](architecture/05-security.md) |
| Yuridik shaxs | Hozircha yo'q → QQS 0; Payme/Click/Uzum, e-faktura, fiskal chek, 1C — firma ochilgach | P10 |
| USD qarzdorlik | Oy oxirida qayta baholanadi | [03-billing-finance.md](architecture/03-billing-finance.md) §7.8 |
| Hosting | Avval lokal → mukammallashtirish → VPS deploy | P8 |
| Mavjud ma'lumot | Yo'q — demo seed | P0 |
| Update imzolash kalitlari | 3 kishi (2-of-3) — agent bosqichida | P9 |

## 13.2 Risklar va kamaytirish (sayt bosqichi)
| # | Risk | Kamaytirish |
|---|---|---|
| 1 | **Moliyaviy ma'lumot buzilishi** (ikki marta invoice, ortiqcha taqsimlash, o'zgartirilgan tarix) | DB darajasidagi qoidalar — 115 ta test bilan isbotlangan; idempotency; append-only; oy yopilishi |
| 2 | **Rahbar akkaunti kompromati** — moliyaviy tasdiqlar va ruxsat berish bitta akkauntda | Passkey + TOTP majburiy, har tasdiq va ruxsat berish Telegram'da bildirishnoma, audit seal, muddatli ruxsatlar |
| 3 | **Ruxsatlarni noto'g'ri berish** (menejerga ortiqcha huquq) | Rahbar faqat o'zida bor ruxsatni beradi; muddatli ruxsat tavsiya; ruxsatlar sahifasida "kimda nima bor" hisoboti |
| 4 | **Portalda boshqa mijoz ma'lumotini ko'rish (IDOR)** | `clientId` faqat sessiyadan + PostgreSQL RLS + avtomatik IDOR testlari |
| 5 | **Scope kengayishi** (qurilma tomoni, integratsiyalar) | Tasdiqlangan tartib: sayt → mukammallashtirish → VPS → agent/integratsiyalar; qat'iy DoD |
| 6 | **Qo'lda kuzatuvdagi reyestr eskirishi** (qurilmada versiya o'zgargani saytga kiritilmaydi) | Deployment natijasini belgilash majburiy qadam; "eskirgan instanslar" hisoboti; keyin agent avtomatlashtiradi |
| 7 | **Lokal bosqichda bitta server** | Kunlik `pg_dump` + restore testi; to'liq PITR va monitoring — P8 |
| 8 | **CBU kursi olinmay qolishi** (qayta baholash bunga bog'liq) | Retry, alert, qo'lda kiritish (rahbar tasdig'i bilan), "as-of" qidiruv |
| 9 | **Prisma/PostgreSQL tuzoqlari** | Konvensiyalar, constraint catalog CI, drift diff bo'sh bo'lishi shart |
| 10 | **Qonunchilik keyin qo'shiladi** (QQS, e-faktura, valyuta qoidalari) | Maydonlar va portlar tayyor; firma ochilgach yurist/buxgalter review |

Qurilma agenti, ESP32, Docker va AI modellarga oid risklar (server buzilishi, yomon update, eFuse, GPU/CUDA va h.k.) — [04-update-agent.md](architecture/04-update-agent.md) da maqsadli dizayn bilan birga saqlangan; P9 boshlanganda qayta ko'rib chiqiladi.

## 13.3 Ochiq savollar
Sayt bosqichini to'xtatadigan ochiq savol yo'q. P9 (agent) va P10 (integratsiyalar) boshlanganda ESP32 chiplari, Secure Boot, Docker, AI model hajmlari va merchant akkauntlar qayta muhokama qilinadi.
