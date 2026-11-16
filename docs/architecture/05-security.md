# Security va permission modeli

> ADS-ERP arxitektura hujjatlari · tasdiqlangan reja (2026-11-10) asosida · [Hujjatlar indeksi](../README.md)

## 9. Security va permission modeli

### 9.1 Printsiplar
**Deny by default** (ruxsat yo'q → rad), **least privilege**, **defense in depth** (har qatlamda alohida himoya), **fail closed**, **separation of duties** (maker-checker), **zero trust between surfaces** (admin, portal, agent, webhook — alohida host, alohida auth, alohida rate-limit).

### 9.2 Identity realm'lar va autentifikatsiya
| Realm | Kim | Autentifikatsiya | Sessiya | MFA |
|---|---|---|---|---|
| STAFF | Xodimlar | Email + parol (Argon2id, m=64 MiB, t=3, p=1) + **TOTP majburiy**; **Passkey (WebAuthn)** — afzal usul | Opaque token, `__Host-ads_admin` cookie (HttpOnly, Secure, SameSite=Strict); idle 30 daq, absolute 12 soat | Majburiy |
| PORTAL | Mijoz foydalanuvchilari | Email + parol (yoki magic-link); email tasdiqlash majburiy | `__Host-ads_portal`; idle 60 daq, absolute 7 kun | owner/accountant uchun tavsiya, policy bilan majburlash mumkin |
| DEVICE | Go agent | ES256 qurilma kaliti + har so'rovga imzolangan assertion (8-bo'lim) | Stateless | — |
| GATEWAY | Payme/Click/Uzum | Provider usuli (Basic auth / imzo) + **IP allowlist** + idempotency | — | — |
| API_KEY | CI, service account | `ads_<prefix>_<secret>`, faqat hash saqlanadi, scope + muddat | — | — |
| TELEGRAM | Bot webhook | `X-Telegram-Bot-Api-Secret-Token` | — | — |

Qo'shimcha qoidalar:
- **Brute-force:** IP + akkaunt bo'yicha progressive delay; 10 xato → 15 daq lock + xavfsizlik alerti; xato xabarlari bir xil (user enumeration yo'q).
- **Parol siyosati:** ≥12 belgi, zxcvbn ≥ 3, (ixtiyoriy) HIBP k-anonymity tekshiruvi; reset'dan keyin barcha sessiyalar bekor qilinadi.
- **Sessiya:** login va huquq o'zgarganda token rotatsiyasi; "faol sessiyalar" ro'yxati va masofadan bekor qilish; yangi qurilmadan kirishda bildirishnoma.
- **Step-up auth:** `sensitive` ruxsatli amallar (refund, void, release publish, prod deploy, rol berish, eksport) oldidan oxirgi 5 daqiqada TOTP/passkey qayta tasdiqlangan bo'lishi shart (`Session.stepUpAt`).
- **CSRF:** SameSite=Strict + `Origin` tekshiruvi + mutatsiya so'rovlarida `X-ADS-CSRF` header (double-submit).
- **Taklif (invite):** bir martalik token (hash, 72 soat) → parol + TOTP o'rnatish → ACTIVE.

### 9.3 Avtorizatsiya: RBAC + Scope + ABAC (CASL)
- Ruxsat formati: `<resource>:<action>` (masalan `invoices:void`, `deployments:start`, `devices:command`).
- **Effektiv ruxsat** = foydalanuvchining har bir `UserRoleAssignment`i bo'yicha rol ruxsatlari ∪, har biri **scope** (GLOBAL / PROJECT:id / CLIENT:id) va **shart** (whitelist'dagi shablonlar: `own_clients` → `{accountManagerId: user.id}`, `project_member` → `{projectId: {in: user.projectIds}}`) bilan cheklangan.
- **5 ta enforcement nuqtasi:**
  1. Route guard: `@RequirePermission('invoices:void')` — CI testi har bir route'da dekorator borligini tekshiradi (himoyasiz endpoint bo'lmaydi);
  2. Use-case: `ability.can('void', subject('Invoice', invoice))` — yuklangan obyekt bilan;
  3. So'rov darajasi: `accessibleBy(ability).Invoice` → Prisma `where` (ro'yxat, qidiruv, eksportda ma'lumot sizib chiqmaydi);
  4. Field darajasi: serializer ruxsat etilmagan maydonlarni olib tashlaydi (masalan, Support roli moliyaviy summalarni ko'rmaydi; PINFL faqat `clients:read_sensitive` bilan, aks holda `****1234`);
  5. UI: CASL `<Can>` — faqat UX uchun, hech qachon ishonchli chegara emas.
- **Eskalatsiyaga qarshi:** foydalanuvchi faqat o'zida bor ruxsatlar to'plamidan iborat rolni bera oladi; `users:manage_roles` — sensitive + approval; Super Admin rolini faqat boshqa Super Admin + approval bilan berish mumkin.
- **Vaqtinchalik huquq:** `expiresAt` bilan JIT access (masalan, support muhandisga 4 soatlik `devices:command`).

**Permission katalogi (qisqa):**
| Resurs | Amallar |
|---|---|
| clients | read, create, update, archive, export, read_sensitive |
| projects | read, create, update, archive, manage_members |
| subscriptions | read, create, update, suspend, reactivate, cancel |
| invoices | read, create, issue, void*, export |
| payments | read, record, allocate, **approve***, export |
| refunds / credit_notes | request, **approve*** |
| gateways | read, configure*, reconcile |
| finance | read, ledger_read, manage_fx, manage_expenses |
| analytics | read, export |
| devices | read, enroll, update, revoke*, command* |
| releases | read, create, upload, publish*, deprecate, revoke* |
| deployments | read, create, start*, pause, cancel, approve* |
| files | read, upload, delete, manage_folders |
| notifications | read, manage_templates |
| users / roles | read, invite, update, deactivate, manage_roles* |
| portal_users | read, invite, deactivate, impersonate* |
| audit | read, export*, verify |
| settings | read, manage* |
| approvals | decide |

`*` = sensitive (step-up; ko'pchiligi approval policy bilan).

**System rollari (seed, o'zgartirib bo'lmaydi; custom rollar qo'shish mumkin):**
| Rol | Asosiy huquqlar |
|---|---|
| **Rahbar (Director)** — tasdiqlangan qaror | Barcha tasdiqlar (`payments:approve`, `refunds:approve`, `credit_notes:approve`, `deployments:approve`, `invoices:void`); **ruxsat berish** (`users:manage_roles`) — faqat o'zida bor ruxsatlarni, doimiy yoki muddatli (`expiresAt`); hammasini o'qish. O'zi kiritgan to'lovni o'zi tasdiqlashi mumkin. Har tasdiq va ruxsat berish — audit + Telegram |
| Menejer | Mijozlar, loyihalar, obunalar, deploymentlar; tasdiqlash huquqi — **faqat rahbar bergan ruxsat bilan** (masalan, `deployments:approve`, muddatli). UI'da "ruxsatlar" sahifasi bitta foydalanuvchiga individual ruxsat yoqish/o'chirish imkonini beradi (ichkarida shaxsiy rol) |
| Super Admin (break-glass, max 2 kishi, passkey majburiy) | Hammasi (texnik); har harakati alert; moliyaviy tasdiq — faqat Rahbar roli orqali |
| Admin | Users/roles (Super Admin'dan tashqari), CRM, projects, devices, settings; moliyada faqat read |
| Finance Manager (keyinroq, jamoa o'sganda) | Subscriptions, invoices, payments, FX, hisobotlar; tasdiqlash — Rahbar |
| Accountant (Buxgalter) | To'lov kiritish (`PENDING_APPROVAL`), allocate, invoice issue; refund/credit note — faqat **so'rov**; ruxsat berilmagan bo'lsa tasdiqlay olmaydi (DB'da tekshiriladi) |
| Account Manager | `own_clients` sharti bilan CRM, obunalar; moliyani read |
| Project Manager | PROJECT scope: loyiha, a'zolar, release publish, deployment approve |
| Release Manager / Developer | PROJECT scope: release create/upload, deployment create (start — approval bilan) |
| Support Engineer | Devices read/command (scope bilan), deploymentlar read, CRM read |
| Auditor | Hammasini read + audit export/verify; hech narsani o'zgartira olmaydi |

**Portal rollari:** `owner` (o'z mijozi doirasida hammasi + portal userlarni boshqarish), `accountant` (invoice, to'lov, onlayn to'lash, akt-sverka), `technician` (qurilmalar, versiyalar), `viewer` (faqat o'qish).

### 9.4 Portal tenant izolyatsiyasi (IDOR/BOLA'ga qarshi 3 qatlam)
1. `clientId` **faqat sessiyadan** olinadi (URL/body'dan hech qachon).
2. Portal repository'lari `PortalScopedPrisma` (Prisma client extension) orqali: client-scoped modellarga `where: {clientId}` avtomatik qo'shiladi; allowlist'da bo'lmagan modelga murojaat → exception.
3. **PostgreSQL RLS** (defense in depth): portal moduli alohida DB roli `app_portal` bilan ulanadi; har so'rov tranzaksiyada `set_config('app.client_id', $1, true)`; client-scoped jadvallarda `USING (client_id = current_setting('app.client_id')::uuid)` policy.
+ Avtomatik **IDOR test suite**: har portal endpoint ikkinchi mijozning ID'lari bilan chaqiriladi → 404 kutiladi.

### 9.5 API xavfsizligi (OWASP API Top 10 2023)
- Zod `strict()` (noma'lum maydon → 400), body limit 1 MB (katta fayllar to'g'ridan-to'g'ri S3'ga), pagination max 100, filter/sort faqat allowlist (client'dan xom Prisma `where` qabul qilinmaydi), DTO'lar aniq (mass assignment yo'q).
- Xatolar RFC 9457 Problem Details, stack trace yo'q.
- Rate-limit qatlamlari: Caddy (IP) → NestJS throttler (user/device/route, Redis store) → auth endpointlar uchun qattiq limit.
- Headerlar: CSP (`default-src 'self'; script-src 'self'; frame-ancestors 'none'; object-src 'none'`), HSTS preload, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, COOP/CORP.
- Fayllar alohida domen (`files.<d>`) dan presigned URL bilan, `Content-Disposition: attachment` — yuklangan HTML/SVG orqali XSS imkonsiz.
- SSRF: server foydalanuvchi bergan URL'larni fetch qilmaydi (faqat allowlist'dagi provider endpointlari).
- Webhooklar: raw body bilan imzo/auth tekshiruvi, IP allowlist, idempotency, replay himoyasi.

### 9.6 Ma'lumotlarni himoyalash
- Transit: TLS 1.3 (min 1.2); DB/Redis faqat ichki Docker tarmog'ida.
- At rest: disk shifrlash (LUKS), shifrlangan backuplar, **field-level encryption** (PINFL, TOTP secret, gateway kalitlari, bot token, SMTP parol) — AES-256-GCM envelope (DEK + KEK, `keyVersion`, rotatsiya job).
- Loglarda redaction (pino `redact`), audit diff'larda sirlar `[REDACTED]`.
- Saqlash muddatlari (yurist bilan tasdiqlanadi): audit va moliya ≥ 5 yil; device events 180 kun; bildirishnomalar 1 yil; tugagan sessiyalar 90 kun.

### 9.7 Sirlar va infratuzilma
- v1: Docker secrets / server'dagi `.env` (600), Git'da sir yo'q (gitleaks pre-commit + CI); keyin SOPS+age yoki Vault. Har sir uchun rotatsiya runbook.
- **Release imzo kalitlari serverda saqlanmaydi** (8-bo'lim).
- DB rollari: `app_migrator` (faqat DDL, faqat migratsiya job), `app_rw` (DML; `audit_logs`/`ledger_entries` da UPDATE/DELETE yo'q), `app_portal` (RLS), `app_readonly` (analitika), `app_backup`.
- Server: SSH faqat kalit bilan (WireGuard/bastion orqali), root login yo'q, ufw (faqat 80/443), CrowdSec/fail2ban, avtomatik xavfsizlik yangilanishlari.
- Konteynerlar: non-root, read-only rootfs, `cap_drop: ALL`, Docker socket mount yo'q, resurs limitlari, image digest bilan pin, Trivy gate.

### 9.8 Threat model (STRIDE, qisqa)
| Tahdid | Misol | Himoya |
|---|---|---|
| Spoofing | Xodim phishing | TOTP/passkey, yangi qurilma alerti, qisqa sessiyalar |
| Spoofing | Soxta qurilma | Bir martalik enrollment token + qurilma kaliti + imzolangan so'rovlar |
| Spoofing | ESP32 klonlash / kalitni o'qib olish | Kalit flash encryption ostida yoki ATECC608'da; `seq` regressiyasi; enrollment tasdiqlash navbati |
| Tampering | Audit/moliyani o'zgartirish | Append-only grantlar + trigger + tungi imzolangan seal; ledger reversal |
| Tampering | Zararli update | Offline imzo (TUF 2-of-3), agent tomonida tekshiruv, revocation (8-bo'lim) |
| Tampering | ESP32'ga zararli firmware | Secure Boot V2 (eFuse) + imzolangan manifest + eFuse anti-rollback (8.14) |
| Tampering | Docker image almashtirish | Image'lar digest bilan pin, compose bundle TUF bilan imzolangan, registry token qisqa muddatli (8.15) |
| Repudiation | "Men refund qilmadim" | Audit (actor, IP, request id, step-up vaqti) + approval yozuvlari |
| Info disclosure | Portalda boshqa mijoz ma'lumoti | 3 qatlamli izolyatsiya + IDOR testlar |
| DoS | 10k agent bir vaqtda | Jitter, backoff, per-device rate limit, presigned S3 yuklab olish |
| Elevation | O'ziga admin rol berish | Subset qoidasi, approval, Super Admin'ga ham SoD |
