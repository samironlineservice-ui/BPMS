# ADR-0011: Obunalar — SubscriptionRevision (temporal model)

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [03-billing-finance.md §7.2, §7.11](../architecture/03-billing-finance.md)

## Kontekst
MRR, churn va boshqa moliyaviy statistikalar istalgan o'tgan sana uchun aniq va o'zgarmas bo'lishi kerak; tarif, narx va miqdor vaqt o'tishi bilan o'zgaradi.

## Qaror
- `Subscription` — identifikatsiya va lifecycle ko'rsatkichlari; shartlar esa **`SubscriptionRevision`** da, ustma-ust tushmaydigan vaqt oraliqlarida (`EXCLUDE USING gist`), bitta ochiq revision (partial unique).
- Revision append-only: faqat `valid_to` bir marta yopiladi (trigger). Item'lar narx snapshot'ini saqlaydi.
- `MrrMovement` (NEW/EXPANSION/CONTRACTION/CHURN/REACTIVATION) revision bilan bitta tranzaksiyada yoziladi; oy yopilganda `MrrSnapshot`.
- Bitta `ClientProject` da bir vaqtda bitta tirik obuna; billing davri — kalendar oy.

## Oqibatlar
- ✅ Point-in-time so'rovlar aniq; tarix hech qachon qayta yozilmaydi; MRR hisobotlari barqaror.
- ⚠️ Har o'zgarish ikki yozuv (eski revision'ni yopish + yangisi) — use-case darajasida inkapsulyatsiya qilinadi.

## Muqobillar
- **Obunadagi mutable maydonlar + o'zgarishlar jurnali** — tarix jurnaldan qayta tiklanishi kerak, nomuvofiqlik xavfi.
