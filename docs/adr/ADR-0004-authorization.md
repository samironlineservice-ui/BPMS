# ADR-0004: Avtorizatsiya — RBAC + scope + CASL; portal uchun RLS

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [05-security.md §9.3–9.4](../architecture/05-security.md), [integrity.sql §15](../architecture/database/integrity.sql)

## Kontekst
Xodimlar turli loyiha/mijozlar doirasida ishlaydi (masalan, PM faqat o'z loyihasi). Portal internetga ochiq — IDOR/BOLA eng katta xavf.

## Qaror
- Ruxsatlar kodda katalog (`resource:action`), rollar DB'da (system + custom), tayinlash `scope` bilan (GLOBAL/PROJECT/CLIENT) va whitelist'dagi shartlar bilan.
- **CASL** — bir xil qoidalar BE va FE'da; `accessibleBy()` → Prisma `where` (ro'yxat/eksport/qidiruvda sizib chiqish yo'q).
- 5 enforcement nuqtasi: route guard, use-case, query, field, UI (faqat UX).
- Portal: `clientId` faqat sessiyadan + `PortalScopedPrisma` + **PostgreSQL RLS** (`app_portal` roli, `app.client_id`). RLS PostgreSQL 18.6 da tekshirildi (begona mijoz ma'lumoti ko'rinmaydi, o'rnatilmagan kontekstda hech narsa ko'rinmaydi).

## Oqibatlar
- ✅ Defense in depth: ilova xatosi bo'lsa ham DB boshqa mijoz ma'lumotini bermaydi.
- ⚠️ Portal so'rovlari tranzaksiyada `set_config` bilan ishlashi kerak (Prisma client extension).

## Muqobillar
- Faqat ilova darajasidagi tekshiruv — rad etildi (bitta unutilgan `where` = ma'lumot sizishi).
