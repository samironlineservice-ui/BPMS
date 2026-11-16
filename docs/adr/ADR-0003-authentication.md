# ADR-0003: Autentifikatsiya — server-side sessiyalar, majburiy TOTP, passkey'lar

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [05-security.md §9.2](../architecture/05-security.md)

## Kontekst
Ikki realm: xodimlar (admin) va mijoz foydalanuvchilari (portal). SPA'lar o'z API'si bilan bir origin'da ishlaydi. Darhol sessiyani bekor qilish va audit talab qilinadi.

## Qaror
- **Opaque session token** `__Host-` cookie'da (HttpOnly, Secure, SameSite=Strict); DB'da faqat SHA-256 hash; Redis kesh. JWT ishlatilmaydi (SPA uchun keraksiz, revocation qiyin).
- Staff: Argon2id + **majburiy TOTP**; passkey (WebAuthn) — afzal usul. Portal: email tasdiqlash, owner/accountant uchun MFA tavsiya.
- Step-up auth: sensitive amallardan oldin 5 daqiqa ichida qayta tasdiq.
- CSRF: SameSite=Strict + Origin tekshiruvi + double-submit header.
- O'zimizning auth moduli (vetted kutubxonalar: argon2, otplib, @simplewebauthn/server).

## Oqibatlar
- ✅ Darhol revoke, "faol sessiyalar" ro'yxati, ikki realm ustidan to'liq nazorat.
- ⚠️ Auth kodini o'zimiz yozamiz → kod review, testlar va pentest majburiy.

## Muqobillar
- **Better Auth / Lucia** — tez, lekin ikki realm + maxsus RBAC + audit talablariga moslashtirish qiyinroq.
- **Keycloak** — kuchli, lekin kichik jamoa uchun operatsion og'ir.
