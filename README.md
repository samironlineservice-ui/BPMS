# ADS-ERP — kompaniya boshqaruv tizimi

Mijozlar, loyihalar, oylik obunalar, invoice va to'lovlar (UZS + USD), moliya (ledger, akt-sverka, oy yopish), rahbar tasdiqlari, qurilmalar va versiyalar reyestri, deploymentlar, mijoz kabineti va bildirishnomalar — bitta tizimda.

Arxitektura va qarorlar: [docs/README.md](docs/README.md) · amalga oshirishdagi aniqlashtirishlar: [ADR-0019](docs/adr/ADR-0019-v1-implementation-stack.md).

## Ishga tushirish (lokal)

Talablar: **Node.js 22.12+**, Linux x64. Docker kerak emas: PostgreSQL 18 npm paketi ichida keladi.

```bash
npm install
npm run db:start        # PostgreSQL → 127.0.0.1:5544 (ma'lumotlar .data/pg)
npm run db:migrate      # migratsiyalar + DB qoidalari (CHECK, trigger, RLS)
npm run seed:demo       # rollar, rahbar akkaunti + demo ma'lumotlar (faqat bo'sh bazaga)
npm run dev             # API :3100 · admin :5173 · mijoz kabineti :5174 · worker
```

`.env` fayli `.env.example` dan olinadi. Prod uchun barcha parol va kalitlarni almashtiring.

### Birinchi kirish

1. http://localhost:5173 — **rahbar@ads.local**, parol: `Rahbar-Parol-2026!` (seed; `SEED_DIRECTOR_EMAIL` / `SEED_DIRECTOR_PASSWORD` bilan o'zgartirish mumkin).
2. Ikki bosqichli himoya: telefoningizga authenticator ilovasini o'rnating (Google Authenticator, Microsoft Authenticator, Aegis…), ekrandagi QR kodni skanerlang va ilovadagi 6 xonali kodni kiriting. Keyingi kirishlarda faqat shu kod so'raladi.
   Lokal ishlashda vaqtincha o'chirish mumkin: `.env` da `MFA_ENABLED=false` (hozir shunday). Serverda (production) bu sozlama e'tiborga olinmaydi — u yerda TOTP har doim majburiy. Holatni Sozlamalar → Tizim'da ko'rasiz.
3. Profil menyusi → **Parolni o'zgartirish**.
4. Sozlamalar → **Kompaniya**: invoice PDF'idagi rekvizitlarni kiriting.
5. Foydalanuvchilar → **Taklif qilish**: xodimlarga taklif havolasi yuboriladi. Rahbar ularga rol yoki alohida (muddatli) ruxsat beradi.

Boshqaruv sayti (5173) — **faqat xodimlar uchun**: unda ro'yxatdan o'tish yo'q, xodim akkauntini rahbar yaratadi (yoki rahbar ruxsat bergan xodim — `users:invite`).

Demo bazada: 6 mijoz, 3 loyiha, 5 obuna (avgustdan beri tarix bilan), 15 invoice, to'lovlar, yopilgan oylar, 12 qurilma, versiyalar, 2 deployment, mijoz kabineti uchun 5 ta foydalanuvchi va 4 ta murojaat bor. Tasdiqlar bo'limida 2 ta kutayotgan so'rov turadi. "(demo)" xodimlari taklif holatida — keraksizlarini o'chirib qo'ying. `npm run seed:demo` mavjud bazada qayta ishga tushirilsa, faqat yetishmayotgan kabinet demosini qo'shadi.

Bazani qayta boshlash (**barcha ma'lumot o'chadi**):

```bash
npm run db:reset && npm run db:migrate && npm run seed        # bo'sh baza
npm run db:reset && npm run db:migrate && npm run seed:demo   # demo bilan
```

### Ishga tushmasa

- **"✗ Port band"** — `npm run dev` boshqa terminalda allaqachon ishlayapti. O'sha oynada Ctrl+C bosing va qayta ishga tushiring.
- **Papkani ko'chirish yoki nomini o'zgartirish** — avval `npm run db:stop` qiling. Ishlab turgan PostgreSQL eski yo'lga bog'langan bo'ladi va tez orada to'xtab qoladi. Ma'lumot yo'qolmaydi. Unutilgan bo'lsa ham `npm run dev` buni o'zi aniqlab, bazani qayta ishga tushiradi.
- **"✗ PostgreSQL ishga tushmadi"** — sababi `.data/pg.log` da yoziladi.
- Hammasi tayyor bo'lganda terminalda **"✓ Tayyor"** va havolalar chiqadi.

### Mijoz kabineti

http://localhost:5174 — mijozlar uchun alohida sayt. Har mijoz faqat o'z ma'lumotini ko'radi (sessiyadagi mijoz + PostgreSQL RLS).

- **Bosh sahifa:** holat banneri (hammasi joyida / to'lov kutilmoqda / muddati o'tgan / xizmat to'xtatilgan), qarz, keyingi hisob sanasi va taxminiy summasi, oylik to'lov, 12 oylik hisob-kitob grafigi, to'lov rekvizitlari (nusxalash tugmalari bilan).
- **Obunalar:** tarif tarkibi, joriy davr, rejalashtirilgan o'zgarish, o'zgarishlar tarixi, qurilmalarda o'rnatilgan versiyalar, invoice'lar, "O'zgartirish so'rash".
- **Invoice'lar** (PDF, to'lov yo'riqnomasi), **To'lovlar** (qaysi invoice'ga taqsimlangani, avans), **Akt-sverka** (tez davrlar, imzo uchun PDF).
- **Qurilmalar:** filial bo'yicha, dastur versiyalari va "yangi versiya mavjud" belgisi.
- **Murojaatlar:** savol, muammo yoki xizmatni o'zgartirish so'rovi; xodimlar javobi shu yerda (xodimlarning ichki izohlari mijozga ko'rinmaydi).
- **Profil** (parolni almashtirish) va **Jamoa** (egasi o'z xodimlarini taklif qiladi va o'chiradi).

Kabinet rollari (serverda majburiy, UI faqat yashiradi):

| Rol | Nimani ko'radi | Cheklov |
|---|---|---|
| Egasi | hammasi | + jamoani boshqaradi |
| Buxgalter | hammasi | jamoa yo'q |
| Texnik mutaxassis | xizmatlar, qurilmalar, murojaatlar | moliya va narxlar ko'rinmaydi |
| Kuzatuvchi | hammasi | faqat ko'radi, murojaat yozmaydi |

Kabinetga ikki yo'l bilan kiriladi:

- **O'zi ro'yxatdan o'tish** (http://localhost:5174/register): kompaniya yoki jismoniy shaxs. Tizimda «Lid» holatida yangi mijoz yaratiladi («kabinet orqali» tegi bilan), u egasi sifatida avtomatik kiradi. «Qanday xizmat kerak?» yozilgan bo'lsa — murojaat ochiladi. Xodimlarga bildirishnoma keladi. Mavjud kompaniyaga (STIR yoki email bo'yicha) o'zi ulana olmaydi — buning uchun menejer taklifi kerak. Yopish: `.env` → `PORTAL_REGISTRATION=false`.
- **Menejer taklifi** (mavjud mijozlar uchun): mijoz kartochkasi → **Kabinet** → taklif → havolani mijozga yuboring (72 soat amal qiladi). Email yuborish hozircha yo'q.

Demo kirishlar (faqat demo baza; parol barchasiga: `Kabinet-Demo-2026!`, `SEED_PORTAL_PASSWORD` bilan o'zgartiriladi):

| Email | Mijoz | Rol |
|---|---|---|
| rustam@baraka.local | Baraka Market | Egasi |
| dilnoza@baraka.local | Baraka Market | Buxgalter |
| jahongir@logistika.local | Toshkent Logistika (USD) | Egasi |
| farrux@tekstil.local | Samarqand Tekstil | Texnik mutaxassis |
| bekzod@orient.local | Orient Foods (xizmat to'xtatilgan) | Egasi |

Xodimlar saytida: **Murojaatlar** bo'limi (javob, ichki izoh, holat, mas'ul xodim; sidebar'da javob kutayotganlar soni) va mijoz kartochkasi → **Murojaatlar**. Yangi murojaat yoki mijoz javobi haqida mas'ul xodimga (bo'lmasa `requests:manage` ruxsati borlarga) bildirishnoma keladi.

### Onlayn to'lovlar: Payme, Click, Uzum Bank, Paynet

Kabinetda mijozning o'zi:
- **Xizmatlar** bo'limida oylik yoki yillik tarifni tanlaydi va onlayn to'laydi. Obuna to'lov tushgach darhol yaratiladi; birinchi invoice to'langan holda chiqadi.
- Invoice'larni «Onlayn to'lash» tugmasi bilan to'laydi.
- Kartasini saqlaydi va avtomatik to'lovni yoqadi (**Kartalar** bo'limi).
- **To'lovlar** bo'limida ko'rsatilgan 8 xonali shaxsiy hisob raqami bilan ilovada yoki Paynet terminalida balansni to'ldiradi.

Pul yechish, sotib olish va kartalar faqat kabinet egasi va buxgalterga ruxsat etilgan.

Har provayderning rejimi **Sozlamalar → To'lov tizimlari** bo'limida tanlanadi:

| Rejim | Nima | Nima kerak |
|---|---|---|
| Emulyator (standart, faqat lokal) | Provayder serveri o'rnida turib, bizning webhook'larni haqiqiy protokol bo'yicha chaqiradi: auth, MD5 imzo, takroriy so'rovlar. To'lov sahifasi — sinov nusxasi; natijada protokol qadamlari ko'rinadi. **Production'da avtomatik o'chiq** | Hech narsa |
| Test (sandbox) | Provayderning haqiqiy sinov muhiti | Merchant kabinetidan test kalitlari va ommaviy HTTPS manzil (`.env` → `PUBLIC_API_URL`) |
| Haqiqiy to'lovlar | Production | Shartnoma va haqiqiy kalitlar |

Emulyator sinov kartalari — Payme sandbox'ining ommaviy kartalari:
- `8600 0691 9540 6311` va `8600 4954 7331 6478`;
- amal qilish muddati `03/99`;
- SMS kod `666666`.

Ular emulyator sahifalarida ham ko'rsatiladi. Haqiqiy karta ishlatilmaydi.

Kalitlar qayerdan olinadi (hammasi Sozlamalar sahifasida, callback URL'lar bilan):
- **Payme:** Payme Business → kassa → «Dasturchilar uchun». Kerak: Merchant ID, `KEY` va `TEST_KEY`. Sandbox: test.paycom.uz. Endpoint — `…/api/v1/gateways/payme`.
- **Click:** merchant kabineti. Kerak: Service ID, Merchant ID, Merchant user ID, Secret key. Prepare/Complete — `…/gateways/click/prepare|complete`.
- **Uzum Bank:** menejer beradi: Service ID va webhook login/parol. URL'lar — `…/gateways/uzum/{check,create,confirm,reverse,status}`.
- **Paynet:** shartnomadan keyin beriladi: Service ID va UWS login/parol. Endpoint — `…/gateways/paynet`.

Kalitlar bazada shifrlangan saqlanadi, javoblarda qaytarilmaydi, audit'ga faqat "qaysi kalit o'zgardi" yoziladi. Karta raqami saqlanmaydi:
- Payme kartasi brauzerdan to'g'ridan-to'g'ri Payme'ga ketadi, bizga faqat token keladi;
- Click kartasining raqami serverdan Click'ga uzatiladi, lekin yozilmaydi.

Production'da:
- CSP'ga `connect-src https://checkout.paycom.uz` qo'shiladi;
- webhook'lar uchun ixtiyoriy IP allowlist bor.

Batafsil: [ADR-0021](docs/adr/ADR-0021-online-payments-gateways.md).

### Telegram bildirishnomalari

1. @BotFather'da bot yarating va tokenni `.env` dagi `TELEGRAM_BOT_TOKEN` ga yozing, keyin `npm run dev` ni qayta ishga tushiring.
2. Har xodim: profil menyusi → **Telegram'ni ulash** → botda "Start".

Token bo'lmasa, bildirishnomalar faqat tizim ichida (qo'ng'iroqcha) ko'rinadi.

### Avtomatik ishlar (worker, Toshkent vaqti)

| Vaqt | Ish |
|---|---|
| 00:10 | Billing: muddati kelgan obunalarga invoice |
| 09:00 | Dunning: muddati o'tgan → to'lov kechikkan → (imtiyozdan keyin) to'xtatilgan; to'langach avtomatik tiklanadi |
| 09:00 / 12:00 / 17:00 | Markaziy bank (CBU) USD kursi. Internet bo'lmasa — Moliya → Kurslar'da qo'lda |
| har 3 s | Outbox → bildirishnomalar, Telegram |
| har 5 daq | To'lov tizimlari: javobsiz tranzaksiyalarni bekor qilish (Payme 12 soat, Uzum 30 daq, Click 60 daq), muddati o'tgan buyurtmalar |
| har 10 daq | To'langan, lekin hali yaratilmagan obunalarni qayta yaratish (checkout) |
| 10:00 | Avtomatik to'lov: yoqilgan kartadan ochiq invoice'lar (kuniga 1 urinish, jami 3 tagacha) |

Worker ishga tushganda o'tkazib yuborilgan kunlik ishlarni bajaradi. Bir nechta worker bo'lsa ham har ish bitta nusxada ishlaydi (advisory lock).

## Tuzilma

```
apps/server        NestJS 12 (Fastify): api | worker | seed rejimlari
apps/admin-web     Xodimlar sayti (React 19, TanStack Router/Query, shadcn/ui, Tailwind 4)
apps/portal-web    Mijoz kabineti (alohida ilova, alohida sessiya)
packages/contracts Zod sxemalar, DTO, ruxsatlar katalogi, pul arifmetikasi (BigInt)
packages/db        Prisma schema (multi-file), migratsiyalar, embedded PostgreSQL skripti
docs/              Arxitektura, ADR, roadmap, acceptance criteria
var/storage        Yuklangan fayllar (lokal disk)
```

## Buyruqlar

| Buyruq | Vazifa |
|---|---|
| `npm run dev` | Hammasi (PostgreSQL, tsc watch, API, worker, ikkala sayt) |
| `npm run build` | TypeScript build + ikkala saytning production build'i |
| `npm run typecheck` | `tsc -b` |
| `npm run db:start` / `db:stop` | PostgreSQL |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:reset` | Bazalarni o'chirib qayta yaratish |
| `npm run seed` / `seed:demo` | Asosiy ma'lumotlar / + demo |
| `npm test` (`npm run smoke`) | Smoke test, taxminan 10 soniya: alohida `ads_erp_test` bazasi noldan yaratiladi va asosiy oqimlar HTTP orqali tekshiriladi — kirish+TOTP, CSRF, billing va proration, to'lov, ledger Σ=0, PDF, kabinet izolyatsiyasi, deployment. Asosiy bazaga tegmaydi. Avval `npx tsc -b` |

## Muhim eslatmalar

- **Vite 7** ga qotirilgan (`overrides`). Bu kompyuter protsessori AVX2'ni qo'llamaydi, Vite 8 (Rolldown) esa unda ishlamaydi.
- Pul summalari hamma joyda **BigInt minor units** (tiyin/sent). Moliyaviy yozuvlar o'chirilmaydi: tuzatish faqat credit note, refund yoki teskari yozuv orqali qilinadi. Bu qoidalarni DB ham majburlaydi.
- Qo'lda kiritilgan to'lovni faqat `payments:approve` ruxsati borlar (rahbar yoki u ruxsat bergan xodim) tasdiqlaydi.

## Holat

Bajarilgan: **P0–P6**.

Keyingi bosqichlar:

- P7: testlar, mukammallashtirish, optimallashtirish.
- P8: VPS deploy.
- P9: qurilma agenti.
- P10: to'lov tizimlarini haqiqiy sandbox'da sertifikatlash (kalitlar va ommaviy URL kerak), fiskal chek, e-faktura.

Onlayn to'lovlar (Payme, Click, Uzum, Paynet) emulyator bilan tayyor: oylik/yillik obunani sotib olish, kartalar, avtomatik to'lov.

Batafsil: [docs/roadmap.md](docs/roadmap.md).
