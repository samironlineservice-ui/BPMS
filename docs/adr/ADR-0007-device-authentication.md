# ADR-0007: Qurilma autentifikatsiyasi — ES256 imzolangan so'rovlar

- **Holat:** Qabul qilingan (2026-11-10)
- **Bog'liq:** [04-update-agent.md §8.3–8.4](../architecture/04-update-agent.md)

## Kontekst
Qurilmalar mijoz tarmoqlarida: NAT, korporativ proxy, TLS'ni uzadigan qurilmalar. Kalit iloji boricha hardware'da bo'lishi kerak; revoke darhol ishlashi kerak.

## Qaror
- Har so'rovga qurilma kaliti bilan imzolangan JWS (`ADS-Sig`): `htm`, `htu`, body hash, `iat`, `jti`, server `nonce`, `seq`.
- Kalit: **ECDSA P-256** (TPM 2.0, Windows CNG, Android Keystore/StrongBox mos; Ed25519 TPM'da yo'q).
- Enrollment: bir martalik, hash'langan, ≤ 72 soatlik token; golden-image takrori → `PENDING_APPROVAL`.
- Klon aniqlash: `seq` high-water mark, machine fingerprint o'zgarishi.

## Oqibatlar
- ✅ Har qanday proxy/LB orqali ishlaydi; bearer token o'g'irlanishi muammosi yo'q; revoke — DB flag.
- ⚠️ Server tomonda `jti` replay keshi (Redis) va nonce boshqaruvi kerak.

## Muqobillar
- **mTLS** — device CA, yangilash, CRL va TLS passthrough talab qiladi; operatsion og'ir.
- **Bearer token** — o'g'irlansa to'liq impersonatsiya.
