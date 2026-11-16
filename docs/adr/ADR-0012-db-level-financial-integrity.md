# ADR-0012: Moliyaviy yaxlitlik DB darajasida

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [integrity.sql](../architecture/database/integrity.sql), [integrity-tests.md](../architecture/database/integrity-tests.md)

## Kontekst
Data integrity — 1-ustuvorlik. Ilovadagi har qanday xato, poyga holati yoki qo'lda SQL moliyaviy ma'lumotni buzmasligi kerak.

## Qaror
- **Append-only:** allocations, credit notes, journal, gateway events, FX kurslari, audit — UPDATE/DELETE trigger va REVOKE bilan taqiqlangan; tuzatish faqat reversal/credit note.
- **Trigger bilan yuritiladigan hisoblagichlar:** `invoices.paid_minor`, `payments.allocated_minor/refunded_minor` — ilova ularga yozmaydi; CHECK'lar ortiqcha taqsimlashni imkonsiz qiladi.
- **Holat mashinalari DB'da:** obuna, to'lov, refund, gateway tranzaksiyasi o'tishlari trigger jadvali bilan.
- **Yakunlangan hujjatlar o'zgarmas:** invoice finalizatsiyasida qatorlar yig'indisi tekshiriladi, keyin muzlatiladi.
- **Double-entry journal:** har entry balanslangan (deferred constraint trigger), yopilgan davrga yozib bo'lmaydi.
- **Composite FK:** "bir mijozga tegishlilik" (filial, obuna, invoice, allocation, deployment to'lqini) DB darajasida.
- **Rahbar tasdig'i (tasdiqlangan qaror):** qo'lda to'lov, credit note, refund — tasdiqlovchida `payments:approve` / `credit_notes:approve` / `refunds:approve` ruxsati borligini DB trigger tekshiradi; rahbar o'zi kiritganini o'zi tasdiqlashi mumkin, ruxsatsiz xodim — hech qachon.
- **Qurilma/o'rnatma mosligi:** mijoz qurilmasida faqat o'sha mijoz instansi, umumiy instans faqat kompaniya qurilmasida, firmware faqat ESP32'da (trigger).
- Runtime rol jadval egasi emas (trigger'ni o'chira olmaydi).

## Oqibatlar
- ✅ 115 ta test bilan isbotlangan (PostgreSQL 18.6); Prisma drift diff bo'sh.
- ⚠️ Biznes qoidasi o'zgarsa migratsiya kerak; xato kodlari (SQLSTATE 23xxx) ilovada foydalanuvchiga tushunarli xabarga map qilinadi.
- ⚠️ Rahbar akkaunti — yagona moliyaviy tasdiq nuqtasi: passkey + TOTP, har tasdiqda Telegram bildirishnomasi va audit bilan himoyalanadi.

## Muqobillar
- **Faqat ilova darajasidagi tekshiruvlar** — bitta xato yoki parallel so'rov moliyaviy ma'lumotni buzishi mumkin.
