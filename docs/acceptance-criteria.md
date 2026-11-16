# Acceptance Criteria

> ADS-ERP arxitektura hujjatlari · bosqichlar [roadmap.md](roadmap.md) bo'yicha (v3) · [Hujjatlar indeksi](README.md)

## 12.0 Har bir bosqich uchun umumiy Definition of Done
- [ ] Code review (≥1 approver), CI yashil: lint, typecheck, unit, integration, security scan, dependency-cruiser.
- [ ] Har yangi endpoint: permission metadata, Zod validatsiya, OpenAPI hujjati, mutatsiyada audit, rate-limit; portal endpoint bo'lsa — IDOR testi.
- [ ] Har DB o'zgarishi: review qilingan migratsiya, constraint testlari, Prisma drift diff bo'sh, expand/contract, seed yangilangan.
- [ ] UI: uz/ru/en kalitlari, loading/empty/error holatlari, dark mode, axe'da critical xato yo'q.
- [ ] Yangi queue/job uchun metrika va (kerak bo'lsa) alert; loglarda requestId.
- [ ] Muhim qaror — ADR; ops ta'siri bo'lsa — runbook.
- [ ] Lokal muhitda demo + rahbar ko'rigi.

## I. Sayt — ishlaydigan menejment tizimi (lokal)

### 12.1 P0 Foundation
- [ ] Toza mashinada README bo'yicha `pnpm i && pnpm dev` ≤ 15 daqiqada barcha servislarni ko'taradi.
- [ ] `apps/server` `api` va `worker` rejimlarida ishga tushadi; `/health/ready` DB, Redis, S3 ni tekshiradi.
- [ ] `packages/db`: tekshirilgan schema + `integrity.sql` migratsiyalarda; **115 ta integrity testi** CI'da (Testcontainers, haqiqiy PostgreSQL) yashil; Prisma drift diff bo'sh.
- [ ] Taqiqlangan modul importi (namuna) CI'ni yiqitadi.
- [ ] Outbox: tranzaksiyada yozilgan event consumer'ga yetadi; relay o'ldirilsa ham yo'qolmaydi, ikki marta qayta ishlanmaydi.
- [ ] Bir xil `Idempotency-Key` bilan takroriy POST — bir xil javob; parallel dublikat — 409.
- [ ] Demo ma'lumot generatori bitta buyruq bilan mijozlar, loyihalar, obunalar, qurilmalar va versiyalarni yaratadi.
- [ ] Admin shell: light/dark, uz/ru/en almashadi.

### 12.2 P1 Foydalanuvchilar · Rollar · Audit · Tasdiqlar · Bildirishnomalar
- [ ] Invite → parol → TOTP → login; TOTP'siz login yakunlanmaydi; 10 xato urinish → vaqtinchalik lock + audit.
- [ ] Idle 30 daq / absolute 12 soat; UI'dan bekor qilingan sessiya darhol ishlamaydi; parol reset barcha sessiyalarni bekor qiladi.
- [ ] Route coverage testi: 100% route'da permission bor; ruxsatsiz so'rov → 403 + `DENIED` audit yozuvi.
- [ ] **Rahbar menejerga ruxsat beradi:** foydalanuvchi sahifasida ruxsatlarni yoqib/o'chirish (doimiy yoki muddatli); rahbar faqat o'zida bor ruxsatni bera oladi; har berish/olish audit qilinadi va Telegram'da xabar qilinadi.
- [ ] **Tasdiqlashlar ruxsat bo'yicha:** har siyosatda `approverPermission`; ruxsati yo'q xodim tasdiqlay olmaydi, muddatli ruxsat tugagach ham (DB'da tekshiriladi); so'rovchi o'zini faqat siyosat ruxsat bersa tasdiqlaydi.
- [ ] Sensitive amal step-up'siz → `401 step_up_required`; TOTP'dan keyin → muvaffaqiyat.
- [ ] Telegram: akkauntni deep-link orqali ulash; tasdiq so'rovi rahbarga < 1 daqiqada yetadi.
- [ ] `audit_logs` o'zgartirib/o'chirib bo'lmaydi; o'zgartirilgan qator `audit:verify` da aniqlanadi.

### 12.3 P2 Mijozlar · Loyihalar · Fayllar
- [ ] STIR/MFO/hisob raqami formatlari tekshiriladi; aktiv mijozlar orasida STIR dublikati DB tomonidan rad etiladi.
- [ ] PINFL faqat shifrlangan; ruxsatsiz maskalangan.
- [ ] Mijoz ↔ loyiha (M:N) ikki tomondan ko'rinadi; dublikat bog'lanish imkonsiz; loyiha komponentlari (VPS qismi, lokal qism …) yuritiladi.
- [ ] Bir yozuvni ikki kishi tahrirlasa — ikkinchisiga 409 + diff dialog.
- [ ] Katta fayl yuklash uzilishdan keyin davom etadi; SHA-256 tekshiriladi; zararli fayl karantinga tushadi; havolalar muddatli; sezgir fayl yuklab olinishi audit qilinadi.
- [ ] Cmd+K qidiruv 10k mijozda < 300 ms.

### 12.4 P3 Obunalar · To'lovlar · Moliya
- [ ] Oylik billing run idempotent: qayta ishga tushirilsa yangi invoice yo'q; worker o'rtada o'ldirilsa — har obunaga aynan bitta invoice.
- [ ] Invoice raqamlari parallel chiqarishda ham unique va uzluksiz; QQS 0 bilan invoice to'g'ri.
- [ ] Qisman to'lov, bir to'lov bilan bir nechta invoice, ortiqcha to'lov → kredit → keyingi invoice'ga avtomatik.
- [ ] Bir invoice'ga parallel to'lovlar ortiqcha taqsimlashga olib kelmaydi (haqiqiy PostgreSQL'da concurrency testi).
- [ ] **Rahbar tasdig'i:** buxgalter kiritgan to'lov `PENDING_APPROVAL` da qoladi va balansga ta'sir qilmaydi; faqat `payments:approve` ruxsati bor xodim (rahbar yoki u ruxsat bergan menejer) POSTED qiladi; rahbar o'zinikini o'zi tasdiqlay oladi. Refund va credit note — xuddi shunday.
- [ ] USD invoice UZS'da to'lansa — kurs snapshot, realized FX alohida hisobda.
- [ ] **Oy oxiri:** ochiq USD invoice'lar CBU kursida qayta baholanadi (keyingi oy reversal); qayta baholashsiz oy yopilmaydi; yopilgan oyga yozib bo'lmaydi.
- [ ] Ledger balansi va akt-sverka invoice/to'lovlar bilan mos.
- [ ] Muddati o'tgan invoice → eslatma → PAST_DUE → SUSPENDED; to'lovdan keyin avtomatik qayta aktivlashadi.

### 12.5 P4 Qurilmalar · Versiyalar · Deploymentlar (reyestr)
- [ ] Qurilma yozuvi: sinf (VPS, server, GPU server, Raspberry Pi, ESP32, desktop), egasi (mijoz + filial yoki **kompaniya VPS'i**), xarakteristikalar, teglar.
- [ ] Kompaniya VPS'ida bir nechta mijozning instansi alohida ko'rinadi; mijoz qurilmasida boshqa mijoz instansi qayd etilmaydi (DB).
- [ ] Versiyalar loyiha/komponent bo'yicha: SemVer, release notes (uz/ru/en), fayllar (SHA-256); bir komponentda versiya unique.
- [ ] Deployment yozuvi: komponent versiyasi → maqsadli instanslar → prod uchun tasdiq (rahbar yoki ruxsat berilgan menejer) → har instans natijasi qo'lda belgilanadi (bajarildi / xato / qaytarildi) → tarix.
- [ ] "Qayerda qaysi versiya" ko'rinishi: mijoz, qurilma, komponent bo'yicha filtr va eksport; to'lanmagan (SUSPENDED) mijozga deployment ogohlantirish bilan.
- [ ] Bitta instans bir vaqtda faqat bitta faol deploymentda (DB).

### 12.6 P5 Mijozlar portali · Telegram
- [ ] Portal: invite → tasdiq → login; IDOR suite (begona ID → 404) o'tadi; RLS ataylab buzilgan so'rovni bloklaydi.
- [ ] Portalda: obunalar, invoicelar (PDF), to'lovlar, akt-sverka, o'z qurilmalari va versiyalari (kompaniya infratuzilmasi ko'rinmaydi); bank rekvizitlari va shaxsiy hisob raqami.
- [ ] Telegram (mijozlar): ulash, invoice va to'lov xabarlari < 1 daqiqada; dublikat xabar yo'q.

### 12.7 P6 Dashboard · Analytics · Hisobotlar
- [ ] MRR/ARR/churn "golden" datasetga mos; o'tgan oy ko'rsatkichlari keyinchalik o'zgarmaydi.
- [ ] Qarzdorlik aging ledger bilan mos (carrying va qayta baholangan qiymat).
- [ ] Versiyalar taqsimoti va eskirgan instanslar ro'yxati.
- [ ] Rolga mos dashboardlar p95 < 1.5 s (demo seed bilan); eksportlar async, ruxsat + audit bilan.

## II. Mukammallashtirish va optimallashtirish
### 12.8 P7
- [ ] Admin API p95 < 300 ms; sekin so'rovlar indekslar bilan tuzatilgan.
- [ ] Xavfsizlik review: ochiq critical/high yo'q.
- [ ] Chaos: worker/api/redis o'ldirilganda ma'lumot yo'qolmaydi, dublikat invoice/to'lov yo'q.
- [ ] Lokal backup/restore mashqi muvaffaqiyatli; foydalanuvchi qo'llanmasi (uz/ru).

## III. VPS deploy
### 12.9 P8
- [ ] Hosting tanlangan (O'zbekistonda, PD lokalizatsiyasi tasdiqlangan); domen, TLS.
- [ ] PITR backup off-site; restore mashqi: RTO ≤ 4 soat, RPO ≤ 15 daq.
- [ ] Monitoring va alertlar, staging, server hardening; lokal ma'lumotlar ko'chirilgan va solishtirilgan.

## IV. Keyingi bosqichlar
### 12.10 P9 Qurilma agenti (soddalashtirilgan birinchi versiya)
- [ ] Linux/Windows agenti kompaniya VPS'i va mijoz qurilmasida servis sifatida ishlaydi; qurilma saytda bir martalik token bilan ro'yxatdan o'tadi.
- [ ] Saytdan **imzolangan fayl** yuboriladi → agent imzo va SHA-256'ni tekshiradi → ishga tushiradi → natija (exit kod, qisqa log) saytga qaytadi va deployment yozuviga tushadi.
- [ ] Imzosiz yoki o'zgartirilgan fayl ishga tushirilmaydi; server buzilsa ham imzosiz fayl yuborib bo'lmaydi (imzo kaliti serverda emas).
- [ ] Revoke qilingan qurilma rad etiladi; qurilma oflayn bo'lsa, ulanganda davom etadi.

### 12.11 P10 Integratsiyalar (firma ochilgach)
- [ ] Payme sandbox test-keyslari to'liq o'tadi; Click va Uzum — rasmiy spetsifikatsiya bo'yicha; webhook takrorlari ikki marta hisoblanmaydi.
- [ ] Kunlik rekonsiliatsiya (tranzaksiyalar ↔ provider ↔ bank).
- [ ] Fiskal chek, QQS, e-faktura, 1C eksport — yurist/buxgalter tasdig'i bilan.
