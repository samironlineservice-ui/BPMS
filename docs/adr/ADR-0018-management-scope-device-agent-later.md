# ADR-0018: ADS-ERP faqat menejment; qurilma qismi — avval reyestr, agent keyin

- **Holat:** Qabul qilingan (2026-11-10, v3) — foydalanuvchi qarori
- **Bog'liq:** [roadmap.md](../roadmap.md), [04-update-agent.md](../architecture/04-update-agent.md), [ADR-0014](ADR-0014-components-and-device-classes.md), [ADR-0015](ADR-0015-esp32-firmware-ota.md), [ADR-0016](ADR-0016-containers-and-ai-models.md)

## Kontekst
Foydalanuvchi aniqlashtirdi: loyihalarning kodi (AI, avtomatizatsiya, firmware …) ADS-ERP'dan **mustaqil** ishlab chiqiladi va ishga tushiriladi; ADS-ERP — **faqat menejment uchun**. Hozirgi ustuvorlik — sayt (menejment veb-ilovasi). Qurilma tomonida keyinchalik kerak bo'ladigan narsa oddiy: **faylni mijoz qurilmasiga yuborish va ishga tushirish**.

## Qaror
- Birinchi versiyada (P0–P8) qurilmalar, versiyalar va deploymentlar saytda **reyestr va qo'lda kuzatuv** sifatida: qaysi mijozda, qaysi qurilmada (kompaniya VPS'i yoki mijoz qurilmasi), qaysi komponentning qaysi versiyasi ishlayapti; deployment yozuvlari tasdiq va qo'lda belgilanadigan natija bilan.
- **Qurilma agenti — P9**, avval soddalashtirilgan: imzolangan faylni yuborish → agent imzo va SHA-256'ni tekshiradi → ishga tushiradi → natijani qaytaradi. Asosiy xavfsizlik tamoyili saqlanadi: **imzo kaliti serverda emas**, server buzilsa ham imzosiz fayl ishga tushmaydi.
- ESP32 (ADR-0015), Docker/AI modellar (ADR-0016), to'liq TUF va bosqichli rollout — **maqsadli dizayn** sifatida hujjatda qoladi; P9 da ehtiyojga qarab bosqichma-bosqich qo'shiladi.
- DB schema'dagi qurilma/reliz/deployment jadvallari qo'lda kuzatuvni ham qo'llab-quvvatlaydi; agentga xos jadvallar (credential, enrollment token, buyruqlar, TUF metadata) P9 gacha ishlatilmaydi.

## Oqibatlar
- ✅ Sayt tezroq tayyor bo'ladi; texnik risk eng katta qism (agent) keyinga, aniq ehtiyoj bilan.
- ✅ Loyihalarning texnologiyasi (Docker yoki servis, qaysi GPU) ADS-ERP dizayniga ta'sir qilmaydi.
- ⚠️ P9 gacha versiya holati qo'lda yuritiladi — eskirish xavfi; "eskirgan instanslar" hisoboti va majburiy natija belgilash bilan kamaytiriladi.

## Muqobillar
- **Agentni birinchi versiyaga kiritish** — sayt kechikadi; foydalanuvchi ustuvorligiga zid.
- **Qurilma qismini umuman olib tashlash** — "qayerda qaysi versiya" ma'lumoti menejment uchun baribir kerak.
