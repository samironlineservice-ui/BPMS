# ADR-0020: Mijoz kabineti — rollar, murojaatlar, to'liq ko'rinish

> [ADR indeksi](README.md) · Holat: **Qabul qilingan** (2026-11-11) · ADR-0004 (portal RLS) ni kengaytiradi

## Kontekst

Foydalanuvchi mijozlar uchun to'liq kabinet so'radi: obunalar, dashboard va boshqalar. Birinchi versiyada kabinet faqat ro'yxatlardan iborat edi:
- portal rollari (OWNER/ACCOUNTANT/TECHNICIAN/VIEWER) bazada bor edi, lekin hech qayerda tekshirilmasdi;
- mijozning kompaniya bilan yozishma kanali yo'q edi.

## Qarorlar

| # | Qaror | Sabab |
|---|---|---|
| 1 | **Rollar serverda majburiy**: `@PortalRoles(...)` + `PortalGuard`. Moliya (invoice, to'lov, akt-sverka) — OWNER/ACCOUNTANT/VIEWER; murojaat yozish — OWNER/ACCOUNTANT/TECHNICIAN; jamoa — faqat OWNER. TECHNICIAN javoblarida summalar `null` | Mijozning texnik xodimi moliyani ko'rmasligi kerak; UI faqat yashiradi |
| 2 | **Murojaatlar** — `client_requests` + `client_request_messages` (migratsiya 0006). Kod `REQ-YYYY-NNNN`. Holatlar: OPEN → IN_PROGRESS → RESOLVED → CLOSED | Mijoz bilan yozishma bitta joyda, tarixi saqlanadi |
| 3 | Xabarlar **append-only** (trigger). Xodimning **ichki izohi** (`is_internal`) mijozga RLS darajasida ko'rinmaydi | Ichki muhokama sizib chiqmaydi, hatto kodda xato bo'lsa ham |
| 4 | Bog'langan obuna/qurilma/portal foydalanuvchisi **aynan shu mijozniki** bo'lishi trigger bilan tekshiriladi | IDOR: boshqa mijozning ID'sini yuborib bo'lmaydi |
| 5 | Kabinetdan yozish **app_rw** orqali (clientId FAQAT sessiyadan, audit + outbox bitta tranzaksiyada), o'qish **app_portal + RLS** | Atomik audit/outbox; o'qishda himoyaning ikkinchi qatlami |
| 6 | Bildirishnoma: yangi murojaat va mijoz javobi → mas'ul xodim, bo'lmasa mijoz menejeri, bo'lmasa `requests:manage` ruxsati borlar | Shovqinsiz: bitta odam javobgar |
| 7 | **Akt-sverka PDF** har so'rovda statement'dan yangidan quriladi (saqlanmaydi). Tomonlar, aylanma, xulosa va imzo joylari bilan | Davr va sana o'zgaruvchan; buxgalteriya imzolab qaytaradi |
| 8 | "Yangi versiya mavjud" = komponentning **stable** kanalidagi eng yangi (prerelease emas, bekor qilinmagan) versiyasi, joriy versiyadan katta (SemVer) | Mijozga faqat chiqarishga tayyor versiya ko'rsatiladi |
| 9 | Kabinet egasi o'z jamoasini taklif qiladi (havola, 72 soat) va o'chiradi. Oxirgi faol egani o'chirib bo'lmaydi | Har safar menejerga murojaat qilmasdan |
| 10 | **Mijozning o'zi ro'yxatdan o'tishi** (foydalanuvchi so'rovi): har doim YANGI «lid» mijoz + asosiy kontakt + OWNER (+ ixtiyoriy birinchi murojaat) — bitta tranzaksiyada, keyin avtomatik kirish. Mavjud STIR/email — 409 (boshqa kompaniyaga ulanib bo'lmaydi). IP va email bo'yicha cheklov, bot maydoni, ma'lumotlarni qayta ishlashga rozilik majburiy. `PORTAL_REGISTRATION=false` bilan yopiladi | Yangi mijozlar oqimi (lid → murojaat → shartnoma); mavjud kompaniyalar ma'lumoti himoyada |
| 11 | **Boshqaruv sayti — faqat kirish**: ro'yxatdan o'tish yo'q, xodim akkauntini rahbar yaratadi (taklif havolasi) | Foydalanuvchi talabi; ichki tizimga begona kira olmasligi |

## Oqibatlar

- Yangi ruxsatlar: `requests:read`, `requests:manage`. Menejer, buxgalter va texnik yordam rollariga berilgan. Mavjud bazada `npm run seed` qo'shadi.
- Smoke test (`npm test`) quyidagilarni tekshiradi:
  - dashboard va obuna tafsiloti;
  - akt-sverka PDF;
  - murojaat oqimi (ichki izoh yashirinligi, begona obunani biriktirishning rad etilishi, yopilgandan keyin yozish);
  - texnik rolining cheklovlari;
  - parolni almashtirish.
- Email tasdiqlash: o'zi ro'yxatdan o'tganlarda `emailVerifiedAt` hozircha bo'sh (email yuborish ulanganda qo'shiladi).
- Keyingi qadamlar:
  - mijozlarga Telegram/email bildirishnomalari (hozir kabinetda "Yangi javob" belgisi);
  - Payme/Click/Uzum orqali to'lash (P10);
  - fayl biriktirish.
