# ADR-0021: Onlayn to'lovlar — Payme, Click, Uzum Bank, Paynet; obuna sotib olish va kartalar

> [ADR indeksi](README.md) · Holat: **Qabul qilingan** (2026-11-11) · ADR-0010 (pul), ADR-0012 (moliyaviy yaxlitlik), ADR-0020 (kabinet) ni kengaytiradi

## Kontekst

Foydalanuvchi mijoz kabinetiga quyidagilarni so'radi:
- oylik va yillik obuna;
- xizmatni o'zi tanlash;
- karta qo'shish;
- O'zbekistondagi barcha to'lov tizimlarini "test API" orqali ulash.

Cheklovlar:
- Haqiqiy sandbox'lar (Payme test kassasi, Click/Uzum/Paynet test servislari) **merchant kabinetidan beriladigan kalitlarni** talab qiladi.
- Sandbox serverlari bizning webhook'larimizga ulanishi uchun **ommaviy HTTPS manzil** kerak.
- Kompaniyada hozircha ikkalasi ham yo'q.

Protokollar rasmiy hujjatlardan olindi:
- Payme: Merchant API va Subscribe API;
- Click: SHOP API va Merchant API;
- Uzum Bank: Merchant API webhook'lari;
- Paynet: UWS v3.4.

## Qarorlar

| # | Qaror | Sabab |
|---|---|---|
| 1 | To'rt provayderning **haqiqiy protokoli** amalga oshirildi. **Payme:** JSON-RPC, Basic `Paycom:KEY`, `CheckPerformTransaction`…`GetStatement`, `SetFiscalData`, 12 soat timeout, xato kodlari `-31001…-31099`. **Click:** Prepare/Complete, MD5 `sign_string`, javob kodlari `0…-9`. **Uzum:** check/create/confirm/reverse/status, Basic auth, `100xx` kodlari, 30 daqiqalik tasdiq oynasi. **Paynet:** UWS JSON-RPC, Basic auth, noto'g'ri auth'da HTTP 401 | Kalitlar kelganda kodni o'zgartirmasdan sandbox sertifikatsiyasidan o'tish |
| 2 | Har provayderda **rejim**: `EMULATOR` (lokal), `TEST` (provayder sandbox'i), `PROD`. Rejim, kalitlar va callback manzillari Sozlamalar → To'lov tizimlari'da | Bir tugma bilan sinovdan haqiqiyga o'tish |
| 3 | **Emulyator** provayder serveri o'rnida turib, BIZNING webhook'larimizni HTTP orqali chaqiradi: haqiqiy auth va imzo, takroriy so'rovlar (idempotentlik), rad etish stsenariysi. Payme Subscribe API va Click Merchant API ham emulyatsiya qilinadi. Kartalar — faqat Payme sandbox'ining **ommaviy sinov kartalari**. **Production'da emulyator hech qachon ishlamaydi** (`isProd` → o'chiq, 404) | Kalitsiz va ommaviy URL'siz to'liq oqimni sinash; kod yo'li haqiqiy rejim bilan bir xil |
| 4 | To'lov buyurtmasi ikki xil. **FIXED:** 12 xonali Luhn raqam, aniq summa; checkout, invoice'lar va avtomatik to'lov uchun. **OPEN_TOPUP:** mijozning 8 xonali shaxsiy hisob raqami, istalgan summa (≥ 1 000 so'm); Payme/Click/Uzum ilovasida yoki Paynet terminalida to'ldirish uchun | Ham "shu hisobni to'lash", ham "balansni to'ldirish" |
| 5 | **Capture atomik va idempotent.** Bitta tranzaksiyada: tranzaksiya holati, Payment (POSTED), ledger yozuvi (Dt clearing 1150/1151/1152/1153, Kt 2100 avans), buyurtma holati, audit va outbox. Qaytarish xodimlar orqali, refund jarayoni bilan | Pul yo'qolmaydi va ikki marta yozilmaydi |
| 6 | **Tekshiruv rad etishi mumkin, capture — yo'q.** Bajarilgan to'lov avtomatik bekor qilinmaydi: Payme `-31007`, Uzum `10017`, Paynet `77` | — |
| 7 | **Taqsimlash va obuna yaratish commit'dan keyin**, webhook javobini kechiktirmasdan bajariladi. Xato bo'lsa worker 10 daqiqada qayta urinadi. Billing'dagi xato provayder yechgan pulni rad ettirmaydi | — |
| 8 | **Checkout: avval to'lov, keyin obuna.** Summa billing bilan aynan bir formulada (`periodBounds` + `itemLines`): birinchi to'liq bo'lmagan davr kunlik hisoblanadi, keyingisi to'liq. To'lov tushgach: mijoz–loyiha bog'lanishi, obuna, birinchi invoice, to'lov **aynan shu invoice'ga**, qoldiq FIFO. Bitta loyiha va bitta davr (oylik va yillik aralashmaydi); loyihada tirik obuna bo'lsa — 409, tarif o'zgarishi murojaat orqali | To'lanmagan "osilib qolgan" obunalar bo'lmaydi |
| 9 | **Katalog:** tarifda `isPublic`, `features[]`, `sortOrder`. Faqat ochiq, faol va so'mdagi narxlar ko'rinadi. Yillik variant — alohida tarif (`intervalMonths = 12`) | Rahbar nima sotilishini boshqaradi |
| 10 | **Kartalar faqat token** sifatida saqlanadi: AES-GCM bilan shifrlanadi, `keyVersion` yoziladi. Ko'rsatish uchun niqoblangan raqam va muddat saqlanadi. **Payme:** karta brauzerdan to'g'ridan-to'g'ri Payme'ga ketadi (`cards.create` → SMS → `cards.verify`), serverga faqat token keladi va `cards.check` bilan tekshiriladi. **Click:** karta raqami serverdan Click'ga uzatiladi, lekin saqlanmaydi va logga yozilmaydi. Portal roli kartalar jadvalini umuman o'qiy olmaydi. Analitika roli token ustunini ko'rmaydi | PCI talablariga yaqin: karta ma'lumoti bizda yo'q |
| 11 | **Karta bilan to'lov.** Payme: `receipts.create` → `receipts.pay`. Click: `card_token/payment`. Pulni FAQAT provayderning Merchant/SHOP callback'i qayd etadi | Ikki marta yozilish xavfi yo'q |
| 12 | **Avtomatik to'lov:** mijozda bitta karta (DB indeksi). Har kuni 10:00 da ochiq invoice'lar uchun urinadi: kuniga bir marta, invoice bo'yicha jami 3 ta muvaffaqiyatsiz urinishgacha | — |
| 13 | **Kabinet ruxsatlari.** To'lash, sotib olish va kartalar — faqat OWNER va ACCOUNTANT (`PAY_ROLES`, `me.access.pay`). Katalog va holat — moliya rollari | Kuzatuvchi va texnik pul yecha olmaydi |
| 14 | **Har webhook so'rovi `gateway_events`ga** yoziladi (xom body, so'rov, javob, auth natijasi, IP, davomiylik); maxfiy maydonlar `[REDACTED]`. Kalitlar shifrlangan; audit'ga faqat qaysi kalit o'zgargani yoziladi. Ixtiyoriy IP allowlist bor | Nizoli holatlar va rekonsiliatsiya uchun dalil |
| 15 | **Uzum orqali karta bog'lash kechiktirildi**: Checkout API'ning bazaviy URL'i ochiq e'lon qilinmagan. Uzum hozircha ilova orqali ishlaydi (buyurtma yoki hisob raqami bilan) | Taxminiy integratsiya yozilmaydi |

## Oqibatlar

- **Migratsiyalar:**
  - `0007` — `PAYNET` enum'lari;
  - `0008` — `checkout_orders`, `payment_cards`, buyurtma maqsadi va holati, provayder rejimi va sozlamalari, CHECK va trigger'lar (bog'langan yozuvlar aynan shu mijozniki), RLS va ustun darajasidagi grant'lar.
- **Ruxsatlar:** `gateways:read` va `gateways:configure` (sezgir). Buxgalterga `gateways:read` berilgan.
- **Ledger:** yangi hisob `1153 Clearing — Paynet`; `cashAccount()` provayderni clearing hisobiga moslaydi. Mavjud bazada `npm run seed` qo'shadi.
- **Worker ishlari:**
  - `gateways.expire` — har 5 daqiqada. Payme 12 soat, Uzum 30 daqiqa, Click 60 daqiqa; muddati o'tgan buyurtmalar va tasdiqlanmagan kartalar yopiladi;
  - `checkout.fulfill` — har 10 daqiqada;
  - `autopay` — har kuni 10:00 da.
- **Smoke test** (`npm test`, 29 qadam). Yangi qadamlar:
  - katalog va rollar;
  - Payme checkout, obuna va to'langan invoice;
  - Payme protokoli: auth, buzuq JSON, Create/Perform/Cancel/Check takrorlari, `-31007`, `GetStatement`;
  - Click: imzo, rad etish, invoice to'lash;
  - Uzum va Paynet: to'ldirish va noto'g'ri auth;
  - kartalar: SMS, avtomatik to'lov, karta bilan obuna.
- **Production uchun qolganlar:**
  - provayder sandbox sertifikatsiyasi (kalitlar va `PUBLIC_API_URL` kerak);
  - CSP'da `connect-src https://checkout.paycom.uz` (Payme karta qo'shish);
  - kunlik rekonsiliatsiya (`GetStatement` va provayder hisobotlari bilan);
  - fiskal chek (narxlarda IKPU, `SetFiscalData` saqlanadi);
  - provayder API orqali refund;
  - avtomatik to'lov muvaffaqiyatsizligi haqida mijozga xabar.

## Muqobillar

- **Faqat haqiqiy sandbox.** Kalitlar va ommaviy URL bo'lmaguncha hech narsa sinab bo'lmaydi.
- **Soxta "muvaffaqiyatli" tugma (mock).** Webhook kodi sinalmaydi va xavfsizlik tekshiruvlari aylanib o'tiladi. Emulyator esa aynan webhook'lar orqali ishlaydi.
- **Obunani to'lovdan oldin yaratish.** To'lanmagan obunalar va keraksiz invoice'lar paydo bo'ladi, ularni bekor qilish uchun credit note kerak bo'ladi.
