# ADR-0010: Pul — BigInt minor units, FX snapshot

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [03-billing-finance.md §7.1, §7.8](../architecture/03-billing-finance.md)

## Kontekst
UZS va USD; gateway'lar (Payme/Uzum) summani butun tiyinda yuboradi; moliyaviy hisob-kitob aniq va qayta tekshiriladigan bo'lishi kerak.

## Qaror
- Summalar — **`BigInt` minor units** (tiyin/sent) + `Currency` enum; kurslar — `Decimal(18,6)`, doim "1 USD = X UZS".
- Yagona arifmetika funksiyasi `mulDivRound()` (half away from zero = PostgreSQL `round(numeric)`), shuning uchun DB CHECK'lar ilova hisobini aynan takrorlaydi.
- API'da summa **string**; global serializer `bigint → string`; lint pul tiplarida `Number()`/`parseFloat`ni taqiqlaydi.
- Har to'lov, invoice va allocation o'z kursini snapshot qiladi; FX farqi realized gain/loss (7100/7200) sifatida alohida.

## Oqibatlar
- ✅ Float xatolari va `Decimal(18,2)` ning jimgina yaxlitlashi (scale drift) imkonsiz.
- ⚠️ Turli minor-unit'li valyutalar (masalan, 0 yoki 3 xonali) qo'shilsa, kurs formulasi moslashtiriladi.

## Muqobillar
- **`Decimal(18,2)`** — o'qilishi oson, lekin ko'p xonali qiymat jimgina yaxlitlanadi va Prisma.Decimal float'ga o'tkazishga vasvasa beradi.
