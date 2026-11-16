# Prisma schema (to'liq, tekshirilgan)

> ADS-ERP arxitektura hujjatlari · [Hujjatlar indeksi](../../README.md) · ER: [er-diagrams.md](er-diagrams.md) · Raw SQL: [integrity.sql](integrity.sql) · Testlar: [integrity-tests.md](integrity-tests.md)

## 0. Holat

- **86 model**, multi-file schema (7 fayl) — `prisma validate` ✅ (Prisma CLI 7.10.1).
- `prisma migrate diff` → PostgreSQL DDL: 86 jadval, 53 enum, 136 foreign key, 23 partial + 1 GIN (trigram) index.
- DDL + [integrity.sql](integrity.sql) **PostgreSQL 18.6** (PGlite) da qo'llandi; **115/115** integrity testi o'tdi ([integrity-tests.md](integrity-tests.md)).
- **Drift tekshiruvi:** `integrity.sql` qo'llangan jonli bazaga nisbatan `prisma migrate diff` — **bo'sh** (Prisma CHECK/EXCLUDE/trigger/RLS/partition'larni o'chirishga urinmaydi).
- **v3:** tasdiqlash siyosatida `approverPermission` — rahbar ruxsatni menejerga beradi (doimiy yoki muddatli).
- **v2 (2026-11-10):** ko'p komponentli loyihalar (`ProjectComponent`, relizlar komponent bo'yicha), qurilma sinflari va egaligi (kompaniya VPS'i, multi-instance), ESP32 (FIRMWARE_OTA / GATEWAY_PROXIED), Docker Compose va AI model artefaktlari, rahbar tasdig'i (`*:approve` ruxsati), oy oxiri FX qayta baholash.
- Bu hali **kod emas** — P0'da `packages/db/prisma/schema/` ga ko'chiriladi. Fayllar ichidagi izohlar o'zbek tilida.

## 1. Konvensiyalar
| Mavzu | Qoida |
|---|---|
| Fayllar | Multi-file schema: `packages/db/prisma/schema/{_base,iam,approvals,audit,crm,projects,billing,gateways,finance,devices,releases,deployments,files,notifications,analytics,system}.prisma` — har modul o'z faylida |
| ID | `String @id @default(uuid(7)) @db.Uuid` (vaqt bo'yicha tartiblangan → B-tree'ga qulay, taxmin qilib bo'lmaydi). Odam o'qiydigan kodlar alohida: `CL-000042`, `INV-2026-000123`, `DV-001234`, `DEP-2026-0007` |
| Nomlash | Model — PascalCase birlik; `@@map("snake_case_plural")`; maydonlar camelCase + `@map("snake_case")` |
| Vaqt | Hamma joyda `@db.Timestamptz(6)` (UTC); sof sanalar (billing davri, due date) — `@db.Date`; billing hisob-kitobi kompaniya TZ (`Asia/Tashkent`) da |
| ⟨std⟩ | Quyidagi kodda `// ⟨std⟩` = `createdAt DateTime @default(now()) @db.Timestamptz(6)` + `updatedAt DateTime @updatedAt @db.Timestamptz(6)` |
| Optimistic lock | O'zgaruvchan aggregate'larda `rowVersion Int @default(1)`; update `where: {id, rowVersion}` + increment; API'da `ETag`/`If-Match`; mos kelmasa 409 |
| Soft delete | Faqat master-data: Client, ClientContact, ClientSite, Project, File, Folder (`deletedAt`). Moliyaviy yozuvlar, audit, ledger — **hech qachon o'chirilmaydi** (void/reversal). User — `status=DEACTIVATED` |
| Unique + soft delete | `deletedAt IS NULL` bo'yicha **partial unique index** (raw SQL) |
| onDelete | Default `Restrict`; `Cascade` faqat sof "child" jadvallarga (RolePermission, ApprovalDecision, InvoiceLine draft holatida emas!) |
| Enum | Barqaror to'plamlar — Prisma enum; kengayadigan kataloglar (permission, event type) — `String` + Zod/lookup jadval |
| Pul | `BigInt` minor units (tiyin/sent) + `Currency` enum; kurs `Decimal(18,6)`; API'da string; float hech qachon (7.1) |
| Shaxsiy ma'lumot | PINFL, TOTP secret, gateway kalitlari — `Bytes` (AES-256-GCM envelope encryption, `keyVersion` bilan); qidiruv uchun HMAC blind index |
| Prisma ifoda qila olmaydigan narsalar | CHECK, partial unique, `UNIQUE NULLS NOT DISTINCT`, EXCLUDE, trigger, partitioning, RLS policy → `prisma migrate dev --create-only` bilan yaratilgan migratsiya SQL'iga qo'lda qo'shiladi; CI'da `prisma migrate diff` (drift) + **constraint test suite** (har bir qoida uchun "buzishga urinish → DB xato qaytaradi" testi) |
| Partitioning | `audit_logs`, `device_events`, `deployment_target_events` — oylik RANGE partition (raw SQL; PK ichida partition key: `@@id([id, occurredAt])`); partitionlarni `pg_partman` yoki worker job yaratadi |
| "Bir mijozga tegishlilik" | Trigger o'rniga **composite FK**: masalan `devices(site_id, client_id) → client_sites(id, client_id)`, `device_installations(client_project_id, client_id, project_id) → client_projects(id, client_id, project_id)`, `payment_allocations(invoice_id, client_id) → invoices(id, client_id)`. Ota jadvalda `@@unique([id, clientId])`. Shunda "boshqa mijozning filiali/invoysi" ga bog'lash DB darajasida imkonsiz |

| `@map` | Har camelCase skalyar maydonga `@map("snake_case")` (572 ta) — P0'da CI lint bilan majburlanadi |
| Partial index | Prisma 7.10 `partialIndexes` preview: `@@unique([...], map: "…_uq", where: raw("…"))`. **Predikatda `IN (...)` ishlatilmaydi** — PostgreSQL uni `= ANY (ARRAY[…])` ga aylantiradi va Prisma har migratsiyada DROP/CREATE taklif qiladi (tekshiruvda topildi); o'rniga `a = 'X' OR a = 'Y'` yoki `a <> 'X' AND a <> 'Y'` |
| Prisma 7 config | `prisma.config.ts` da `datasource.url` bo'lishi shart — aks holda `prisma migrate diff` xatosiz, lekin bo'sh natija qaytaradi (tekshiruvda topildi) |
| Versiya | Prisma ORM **7.10.1** (oxirgi barqaror 7.x); Prisma 8 hozircha RC — P0'da 7.10.x ga pin qilinadi (ADR-0002) |

## 2. Schema fayllari

### 2.1 `_base.prisma` — Generator va datasource

```prisma
// ADS-ERP — Prisma schema (multi-file). Konvensiyalar: docs/architecture/database/prisma-schema.md
// Ustun nomlari: camelCase maydon → @map("snake_case"); jadval nomlari: @@map("snake_case_plural").
// CHECK / EXCLUDE / trigger / partitioning / RLS — docs/architecture/database/integrity.sql

generator client {
  provider        = "prisma-client"
  output          = "../../generated/prisma"
  previewFeatures = ["partialIndexes"]
}

datasource db {
  provider = "postgresql"
}
```

### 2.2 `iam.prisma` — IAM: xodimlar, rollar, sessiyalar, portal foydalanuvchilari

```prisma
// ─── IAM: xodimlar, rollar, ruxsatlar, sessiyalar, portal foydalanuvchilari ───

enum AuthRealm {
  STAFF
  PORTAL
}

enum UserStatus {
  INVITED
  ACTIVE
  LOCKED
  DEACTIVATED
}

enum ScopeType {
  GLOBAL
  PROJECT
  CLIENT
}

enum PortalRole {
  OWNER
  ACCOUNTANT
  TECHNICIAN
  VIEWER
}

model User {
  id                String     @id @default(uuid(7)) @db.Uuid
  email             String     @unique // CHECK: email = lower(email)
  fullName          String @map("full_name")
  phone             String?
  locale            String     @default("uz")
  timezone          String     @default("Asia/Tashkent")
  status            UserStatus @default(INVITED)
  isServiceAccount  Boolean    @default(false) @map("is_service_account") // CI / integratsiyalar (ApiKey egasi)
  passwordHash      String? @map("password_hash") // argon2id
  passwordChangedAt DateTime?  @db.Timestamptz(6) @map("password_changed_at")
  mfaRequired       Boolean    @default(true) @map("mfa_required")
  failedLoginCount  Int        @default(0) @map("failed_login_count")
  lockedUntil       DateTime?  @db.Timestamptz(6) @map("locked_until")
  lastLoginAt       DateTime?  @db.Timestamptz(6) @map("last_login_at")
  rowVersion        Int        @default(1) @map("row_version")
  createdAt         DateTime   @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt         DateTime   @updatedAt @db.Timestamptz(6) @map("updated_at")

  roleAssignments       UserRoleAssignment[] @relation("UserRoles")
  rolesGranted          UserRoleAssignment[] @relation("RoleGrantedBy")
  sessions              Session[]            @relation("UserSessions")
  mfaFactors            MfaFactor[]
  passkeys              Passkey[]
  recoveryCodes         RecoveryCode[]
  apiKeys               ApiKey[]
  approvalRequests      ApprovalRequest[]    @relation("ApprovalRequestedBy")
  approvalDecisions     ApprovalDecision[]   @relation("ApprovalDecidedBy")
  managedClients        Client[]             @relation("ClientAccountManager")
  clientNotes           ClientNote[]         @relation("ClientNoteAuthor")
  ownedProjects         Project[]            @relation("ProjectOwner")
  projectMemberships    ProjectMember[]      @relation("ProjectMemberUser")
  managedClientProjects ClientProject[]      @relation("ClientProjectAccountManager")
  enrollmentTokens      EnrollmentToken[]    @relation("EnrollmentTokenCreatedBy")
  deviceCommands        DeviceCommand[]      @relation("DeviceCommandCreatedBy")
  releasesCreated       Release[]            @relation("ReleaseCreatedBy")
  releasesPublished     Release[]            @relation("ReleasePublishedBy")
  releasePromotions     ReleaseChannelEntry[] @relation("ReleasePromotedBy")
  tufUploads            TufMetadata[]        @relation("TufMetadataUploadedBy")
  deploymentsCreated    Deployment[]         @relation("DeploymentCreatedBy")
  reportJobs            ReportJob[]          @relation("ReportRequestedBy")
  savedViews            SavedView[]          @relation("SavedViewOwner")
  settingsUpdated       Setting[]            @relation("SettingUpdatedBy")
  planPricesCreated     PlanPrice[]          @relation("PlanPriceCreatedBy")
  creditNotesCreated    CreditNote[]         @relation("CreditNoteCreatedBy")
  creditNotesApproved   CreditNote[]         @relation("CreditNoteApprovedBy")
  paymentsCreated       Payment[]            @relation("PaymentCreatedBy")
  paymentsApproved      Payment[]            @relation("PaymentApprovedBy")
  refundsRequested      Refund[]             @relation("RefundRequestedBy")
  refundsApproved       Refund[]             @relation("RefundApprovedBy")
  fxRatesCreated        FxRate[]             @relation("FxRateCreatedBy")
  periodsClosed         FinancialPeriod[]    @relation("PeriodClosedBy")
  expensesCreated       Expense[]            @relation("ExpenseCreatedBy")

  @@map("users")
}

model Role {
  id          String    @id @default(uuid(7)) @db.Uuid
  key         String    @unique // "finance_manager"
  name        String
  description String?
  realm       AuthRealm @default(STAFF)
  isSystem    Boolean   @default(false) @map("is_system") // system rollari tahrirlanmaydi/o'chirilmaydi (trigger)
  rowVersion  Int       @default(1) @map("row_version")
  createdAt   DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt   DateTime  @updatedAt @db.Timestamptz(6) @map("updated_at")

  permissions RolePermission[]
  assignments UserRoleAssignment[]

  @@map("roles")
}

/// Koddagi katalogdan (packages/contracts/permissions.ts) seed qilinadi — yagona manba.
model Permission {
  key         String  @id // "invoices:void"
  module      String
  description String
  sensitive   Boolean @default(false) // step-up auth va/yoki approval talab qiladi

  roles RolePermission[]

  @@map("permissions")
}

model RolePermission {
  roleId        String   @db.Uuid @map("role_id")
  permissionKey String @map("permission_key")
  condition     String? // whitelist'dagi shart: "own_clients" | "project_member" ...
  fields        String[] // field-level cheklov (bo'sh = barcha maydonlar)

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionKey], references: [key], onDelete: Restrict)

  @@id([roleId, permissionKey])
  @@map("role_permissions")
}

model UserRoleAssignment {
  id          String    @id @default(uuid(7)) @db.Uuid
  userId      String    @db.Uuid @map("user_id")
  roleId      String    @db.Uuid @map("role_id")
  scopeType   ScopeType @default(GLOBAL) @map("scope_type")
  scopeId     String?   @db.Uuid @map("scope_id") // PROJECT/CLIENT id (polimorf); CHECK: GLOBAL ⇔ NULL
  grantedById String?   @db.Uuid @map("granted_by_id")
  expiresAt   DateTime? @db.Timestamptz(6) @map("expires_at") // vaqtinchalik (JIT) huquq
  createdAt   DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  user      User  @relation("UserRoles", fields: [userId], references: [id], onDelete: Restrict)
  role      Role  @relation(fields: [roleId], references: [id], onDelete: Restrict)
  grantedBy User? @relation("RoleGrantedBy", fields: [grantedById], references: [id], onDelete: Restrict)

  @@index([userId])
  @@index([scopeType, scopeId])
  @@unique([userId, roleId], map: "user_role_assignments_global_uq", where: raw("scope_type = 'GLOBAL'"))
  @@unique([userId, roleId, scopeType, scopeId], map: "user_role_assignments_scoped_uq", where: raw("scope_type <> 'GLOBAL'"))
  @@map("user_role_assignments")
}

model Session {
  id                String    @id @default(uuid(7)) @db.Uuid
  realm             AuthRealm
  userId            String?   @db.Uuid @map("user_id") // CHECK: STAFF ⇔ userId, PORTAL ⇔ portalUserId
  portalUserId      String?   @db.Uuid @map("portal_user_id")
  tokenHash         String    @unique @map("token_hash") // SHA-256(token); token faqat cookie'da
  mfaVerifiedAt     DateTime? @db.Timestamptz(6) @map("mfa_verified_at")
  stepUpAt          DateTime? @db.Timestamptz(6) @map("step_up_at")
  ip                String?   @db.Inet
  userAgent         String? @map("user_agent")
  lastSeenAt        DateTime  @default(now()) @db.Timestamptz(6) @map("last_seen_at")
  idleExpiresAt     DateTime  @db.Timestamptz(6) @map("idle_expires_at")
  absoluteExpiresAt DateTime  @db.Timestamptz(6) @map("absolute_expires_at")
  revokedAt         DateTime? @db.Timestamptz(6) @map("revoked_at")
  revokeReason      String? @map("revoke_reason")
  createdAt         DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  user       User?       @relation("UserSessions", fields: [userId], references: [id], onDelete: Cascade)
  portalUser PortalUser? @relation("PortalUserSessions", fields: [portalUserId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([portalUserId])
  @@map("sessions")
}

model MfaFactor {
  id          String    @id @default(uuid(7)) @db.Uuid
  userId      String    @db.Uuid @map("user_id")
  type        String    @default("TOTP")
  secretEnc   Bytes @map("secret_enc") // AES-256-GCM (envelope)
  keyVersion  Int @map("key_version")
  confirmedAt DateTime? @db.Timestamptz(6) @map("confirmed_at")
  createdAt   DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("mfa_factors")
}

model Passkey {
  id           String    @id @default(uuid(7)) @db.Uuid
  userId       String    @db.Uuid @map("user_id")
  credentialId String    @unique @map("credential_id")
  publicKey    Bytes @map("public_key")
  counter      BigInt    @default(0)
  transports   String[]
  name         String?
  lastUsedAt   DateTime? @db.Timestamptz(6) @map("last_used_at")
  createdAt    DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("passkeys")
}

model RecoveryCode {
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String    @db.Uuid @map("user_id")
  codeHash  String @map("code_hash")
  usedAt    DateTime? @db.Timestamptz(6) @map("used_at")
  createdAt DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("recovery_codes")
}

model ApiKey {
  id         String    @id @default(uuid(7)) @db.Uuid
  ownerId    String    @db.Uuid @map("owner_id") // service account (User.isServiceAccount)
  prefix     String    @unique
  secretHash String @map("secret_hash")
  scopes     String[]
  expiresAt  DateTime? @db.Timestamptz(6) @map("expires_at")
  lastUsedAt DateTime? @db.Timestamptz(6) @map("last_used_at")
  revokedAt  DateTime? @db.Timestamptz(6) @map("revoked_at")
  createdAt  DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  owner User @relation(fields: [ownerId], references: [id], onDelete: Restrict)

  @@index([ownerId])
  @@map("api_keys")
}

model PortalUser {
  id              String     @id @default(uuid(7)) @db.Uuid
  clientId        String     @db.Uuid @map("client_id")
  contactId       String?    @unique @db.Uuid @map("contact_id")
  email           String // partial unique (lower(email)) WHERE status <> 'DEACTIVATED'
  fullName        String @map("full_name")
  passwordHash    String? @map("password_hash")
  status          UserStatus @default(INVITED)
  portalRole      PortalRole @default(VIEWER) @map("portal_role")
  emailVerifiedAt DateTime?  @db.Timestamptz(6) @map("email_verified_at")
  mfaEnabled      Boolean    @default(false) @map("mfa_enabled")
  lastLoginAt     DateTime?  @db.Timestamptz(6) @map("last_login_at")
  rowVersion      Int        @default(1) @map("row_version")
  createdAt       DateTime   @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime   @updatedAt @db.Timestamptz(6) @map("updated_at")

  client   Client         @relation(fields: [clientId], references: [id], onDelete: Restrict)
  contact  ClientContact? @relation(fields: [contactId], references: [id], onDelete: Restrict)
  sessions Session[]      @relation("PortalUserSessions")

  @@index([clientId])
  @@unique([email], map: "portal_users_email_active_uq", where: raw("status <> 'DEACTIVATED'"))
  @@map("portal_users")
}
```

### 2.3 `approvals_audit.prisma` — Approvals (maker-checker) va Audit

```prisma
// ─── Approvals (maker-checker) va Audit ───

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  CANCELLED
  EXECUTED
}

enum ActorType {
  STAFF
  PORTAL_USER
  DEVICE
  SYSTEM
  GATEWAY
  API_KEY
}

enum AuditResult {
  SUCCESS
  DENIED
  FAILED
}

model ApprovalPolicy {
  key               String   @id // "payments.refund", "deployments.production", "invoices.void"
  description       String
  requiredApprovals  Int      @default(1) @map("required_approvals")
  approverPermission String @map("approver_permission") // tasdiqlovchida bo'lishi shart bo'lgan ruxsat: "deployments:approve" … (rahbar uni menejerga berishi mumkin)
  thresholdMinor     BigInt? @map("threshold_minor") // summa chegarasi (masalan, qo'lda to'lov uchun)
  enabled           Boolean  @default(true)
  allowSelfApproval Boolean  @default(false) @map("allow_self_approval") // true: ruxsati bor shaxs (masalan, rahbar) o'z so'rovini tasdiqlay oladi
  updatedAt         DateTime @updatedAt @db.Timestamptz(6) @map("updated_at")

  requests ApprovalRequest[]

  @@map("approval_policies")
}

model ApprovalRequest {
  id                String         @id @default(uuid(7)) @db.Uuid
  policyKey         String @map("policy_key")
  resourceType      String @map("resource_type")
  resourceId        String?        @db.Uuid @map("resource_id")
  payload           Json // bajariladigan amalning to'liq parametrlari
  payloadHash       String @map("payload_hash") // tasdiqdan keyin payload o'zgarmaganini kafolatlaydi
  requestedById     String         @db.Uuid @map("requested_by_id")
  requiredApprovals Int            @default(1) @map("required_approvals")
  status            ApprovalStatus @default(PENDING)
  expiresAt         DateTime       @db.Timestamptz(6) @map("expires_at")
  executedAt        DateTime?      @db.Timestamptz(6) @map("executed_at")
  createdAt         DateTime       @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt         DateTime       @updatedAt @db.Timestamptz(6) @map("updated_at")

  policy         ApprovalPolicy     @relation(fields: [policyKey], references: [key], onDelete: Restrict)
  requestedBy    User               @relation("ApprovalRequestedBy", fields: [requestedById], references: [id], onDelete: Restrict)
  decisions      ApprovalDecision[]
  deployments    Deployment[]
  deviceCommands DeviceCommand[]
  voidedInvoices Invoice[]          @relation("InvoiceVoidApproval")

  @@index([status, policyKey])
  @@map("approval_requests")
}

model ApprovalDecision {
  id         String   @id @default(uuid(7)) @db.Uuid
  requestId  String   @db.Uuid @map("request_id")
  approverId String   @db.Uuid @map("approver_id") // trigger: approver ≠ requester (separation of duties)
  approve    Boolean
  comment    String?
  createdAt  DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  request  ApprovalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  approver User            @relation("ApprovalDecidedBy", fields: [approverId], references: [id], onDelete: Restrict)

  @@unique([requestId, approverId])
  @@map("approval_decisions")
}

/// PARTITION BY RANGE (occurred_at) — oylik; app roliga faqat INSERT/SELECT.
model AuditLog {
  id             String      @default(uuid(7)) @db.Uuid
  occurredAt     DateTime    @default(now()) @db.Timestamptz(6) @map("occurred_at")
  seq            BigInt      @default(autoincrement())
  actorType      ActorType @map("actor_type")
  actorId        String?     @db.Uuid @map("actor_id") // polimorf (soft reference)
  actorLabel     String? @map("actor_label") // snapshot: email / qurilma nomi
  impersonatorId String?     @db.Uuid @map("impersonator_id")
  ip             String?     @db.Inet
  userAgent      String? @map("user_agent")
  requestId      String? @map("request_id")
  action         String // "invoice.void"
  resourceType   String @map("resource_type")
  resourceId     String? @map("resource_id")
  result         AuditResult
  reason         String?
  changes        Json? // { before, after } — sirlar redacted
  metadata       Json?

  @@id([id, occurredAt])
  @@index([resourceType, resourceId, occurredAt])
  @@index([actorType, actorId, occurredAt])
  @@index([action, occurredAt])
  @@index([seq])
  @@map("audit_logs")
}

/// Tungi job: seq oralig'i bo'yicha hash-chain + Ed25519 imzo.
model AuditSeal {
  id           String   @id @default(uuid(7)) @db.Uuid
  fromSeq      BigInt   @unique @map("from_seq")
  toSeq        BigInt @map("to_seq")
  rowCount     Int @map("row_count")
  chainHash    String @map("chain_hash") // H(prevSealHash ‖ H(row₁) ‖ … ‖ H(rowₙ))
  prevSealHash String? @map("prev_seal_hash")
  signature    String
  keyId        String @map("key_id")
  createdAt    DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@map("audit_seals")
}
```

### 2.4 `crm_projects.prisma` — CRM, Projects va loyiha komponentlari (M:N yadrosi)

```prisma
// ─── CRM (mijozlar) va Projects (loyihalar) — M:N yadrosi: ClientProject ───

enum ClientType {
  COMPANY
  INDIVIDUAL
}

enum ClientStatus {
  LEAD
  ACTIVE
  SUSPENDED
  CHURNED
  ARCHIVED
}

enum TagScope {
  CLIENT
  DEVICE
}

enum ProjectStatus {
  PLANNING
  IN_DEVELOPMENT
  ACTIVE
  MAINTENANCE
  DEPRECATED
  ARCHIVED
}

enum ProjectMemberRole {
  LEAD
  DEVELOPER
  QA
  SUPPORT
}

enum ClientProjectStatus {
  PROSPECT
  ONBOARDING
  ACTIVE
  SUSPENDED
  CHURNED
}

enum Platform {
  WINDOWS
  LINUX
  ANDROID
  ESP_IDF // ESP32 oilasi (FreeRTOS)
}

/// Komponent qayerda va qanday ishlaydi
enum ComponentRuntime {
  SERVER_SERVICE // fon servisi: systemd / Windows Service (VPS, lokal server, Raspberry Pi)
  CONTAINER_STACK // Docker Compose stack (VPS, GPU server)
  STATIC_WEB // statik web build
  DESKTOP_APP // Windows/Linux desktop ilova
  FIRMWARE // ESP32 va boshqa mikrokontrollerlar
  AI_MODEL // model og'irliklari / data bundle
  MOBILE_APP // Android (keyingi bosqich)
}

model Client {
  id               String       @id @default(uuid(7)) @db.Uuid
  code             String       @unique // CL-000042
  type             ClientType
  legalName        String @map("legal_name")
  displayName      String @map("display_name")
  tin              String?      @db.VarChar(9) // STIR — CHECK '^\d{9}$'
  pinflEnc         Bytes? @map("pinfl_enc") // JSHSHIR (14 raqam) — shifrlangan
  pinflHash        String? @map("pinfl_hash") // HMAC blind index
  vatPayer         Boolean      @default(false) @map("vat_payer")
  legalAddress     String? @map("legal_address")
  region           String?
  bankName         String? @map("bank_name")
  bankMfo          String?      @db.VarChar(5) @map("bank_mfo")
  bankAccount      String?      @db.VarChar(20) @map("bank_account")
  billingEmail     String? @map("billing_email")
  phone            String?
  preferredLocale  String       @default("uz") @map("preferred_locale")
  billingCurrency  Currency     @default(UZS) @map("billing_currency")
  accountNo        String       @unique @db.VarChar(8) @map("account_no") // Luhn; Payme/Click/Uzum ilovasida kiritiladigan shaxsiy hisob
  isResident       Boolean      @default(true) @map("is_resident") // valyuta qonunchiligi: rezident → UZS'da hisob-kitob
  status           ClientStatus @default(LEAD)
  accountManagerId String?      @db.Uuid @map("account_manager_id")
  rowVersion       Int          @default(1) @map("row_version")
  createdAt        DateTime     @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt        DateTime     @updatedAt @db.Timestamptz(6) @map("updated_at")
  deletedAt        DateTime?    @db.Timestamptz(6) @map("deleted_at")

  accountManager   User?             @relation("ClientAccountManager", fields: [accountManagerId], references: [id], onDelete: Restrict)
  contacts         ClientContact[]
  sites            ClientSite[]
  clientNotes      ClientNote[]
  tags             ClientTag[]
  projects         ClientProject[]
  portalUsers      PortalUser[]
  subscriptions    Subscription[]
  invoices         Invoice[]
  payments         Payment[]
  paymentOrders    PaymentOrder[]
  devices          Device[]
  enrollmentTokens EnrollmentToken[]
  journalLines     JournalLine[]
  mrrMovements     MrrMovement[]

  @@unique([tin], map: "clients_tin_active_uq", where: raw("deleted_at IS NULL"))
  @@unique([pinflHash], map: "clients_pinfl_active_uq", where: raw("deleted_at IS NULL"))
  @@index([status])
  @@index([accountManagerId])
  @@index([legalName(ops: raw("gin_trgm_ops")), displayName(ops: raw("gin_trgm_ops"))], type: Gin, map: "clients_search_trgm_idx") // global qidiruv (pg_trgm)
  @@map("clients")
}

model ClientContact {
  id        String    @id @default(uuid(7)) @db.Uuid
  clientId  String    @db.Uuid @map("client_id")
  fullName  String @map("full_name")
  position  String?
  phone     String?
  email     String?
  telegram  String?
  isPrimary Boolean   @default(false) @map("is_primary")
  isBilling Boolean   @default(false) @map("is_billing")
  createdAt DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt DateTime  @updatedAt @db.Timestamptz(6) @map("updated_at")
  deletedAt DateTime? @db.Timestamptz(6) @map("deleted_at")

  client     Client      @relation(fields: [clientId], references: [id], onDelete: Restrict)
  portalUser PortalUser?

  @@index([clientId])
  @@unique([clientId], map: "client_contacts_one_primary_uq", where: raw("is_primary AND deleted_at IS NULL"))
  @@map("client_contacts")
}

model ClientSite {
  id                String    @id @default(uuid(7)) @db.Uuid
  clientId          String    @db.Uuid @map("client_id")
  name              String
  address           String?
  region            String?
  timezone          String    @default("Asia/Tashkent")
  maintenanceWindow Json? @map("maintenance_window") // {days:[1..7], from:"02:00", to:"05:00"}
  createdAt         DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt         DateTime  @updatedAt @db.Timestamptz(6) @map("updated_at")
  deletedAt         DateTime? @db.Timestamptz(6) @map("deleted_at")

  client           Client            @relation(fields: [clientId], references: [id], onDelete: Restrict)
  devices          Device[]
  enrollmentTokens EnrollmentToken[]

  @@unique([id, clientId]) // composite FK nishoni
  @@unique([clientId, name], map: "client_sites_name_active_uq", where: raw("deleted_at IS NULL"))
  @@map("client_sites")
}

model ClientNote {
  id        String   @id @default(uuid(7)) @db.Uuid
  clientId  String   @db.Uuid @map("client_id")
  authorId  String   @db.Uuid @map("author_id")
  body      String
  pinned    Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  client Client @relation(fields: [clientId], references: [id], onDelete: Restrict)
  author User   @relation("ClientNoteAuthor", fields: [authorId], references: [id], onDelete: Restrict)

  @@index([clientId, createdAt])
  @@map("client_notes")
}

model Tag {
  id    String   @id @default(uuid(7)) @db.Uuid
  scope TagScope
  name  String
  color String?

  clients ClientTag[]
  devices DeviceTag[]

  @@unique([scope, name])
  @@map("tags")
}

model ClientTag {
  clientId String @db.Uuid @map("client_id")
  tagId    String @db.Uuid @map("tag_id")

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([clientId, tagId])
  @@map("client_tags")
}

model Project {
  id                 String        @id @default(uuid(7)) @db.Uuid
  code               String        @unique // slug: "pos-retail" (TUF yo'llarida ham ishlatiladi)
  name               String
  description        String?
  status             ProjectStatus @default(PLANNING)
  ownerId            String?       @db.Uuid @map("owner_id")
  repositoryUrl      String? @map("repository_url")
  supportedPlatforms Platform[] @map("supported_platforms")
  isInternal         Boolean       @default(false) @map("is_internal") // masalan, "ads-agent" — agentning o'zi
  rowVersion         Int           @default(1) @map("row_version")
  createdAt          DateTime      @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt          DateTime      @updatedAt @db.Timestamptz(6) @map("updated_at")
  deletedAt          DateTime?     @db.Timestamptz(6) @map("deleted_at")

  owner        User?            @relation("ProjectOwner", fields: [ownerId], references: [id], onDelete: Restrict)
  components   ProjectComponent[]
  members      ProjectMember[]
  clients      ClientProject[]
  plans        Plan[]
  channels     ReleaseChannel[]
  releases     Release[]
  deployments  Deployment[]
  mrrMovements MrrMovement[]
  journalLines JournalLine[]
  expenses     Expense[]

  @@map("projects")
}

/// Loyiha qismi: masalan "pos-server" (VPS), "edge-ai" (GPU server), "sensor-fw" (ESP32).
/// Versiyalar (Release) komponent bo'yicha chiqariladi; mosligi TUF `requires` orqali.
model ProjectComponent {
  id                 String           @id @default(uuid(7)) @db.Uuid
  projectId          String           @db.Uuid @map("project_id")
  key                String // slug — TUF yo'lida ishlatiladi
  name               String
  description        String?
  runtime            ComponentRuntime
  supportedPlatforms Platform[] @map("supported_platforms")
  isActive           Boolean          @default(true) @map("is_active")
  createdAt          DateTime         @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt          DateTime         @updatedAt @db.Timestamptz(6) @map("updated_at")

  project       Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)
  releases      Release[]
  installations DeviceInstallation[]
  deployments   Deployment[]

  @@unique([projectId, key])
  @@unique([id, projectId]) // composite FK nishoni
  @@map("project_components")
}

model ProjectMember {
  projectId String            @db.Uuid @map("project_id")
  userId    String            @db.Uuid @map("user_id")
  role      ProjectMemberRole
  addedAt   DateTime          @default(now()) @db.Timestamptz(6) @map("added_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation("ProjectMemberUser", fields: [userId], references: [id], onDelete: Restrict)

  @@id([projectId, userId])
  @@index([userId])
  @@map("project_members")
}

/// M:N — birinchi darajali entity. Obunalar, o'rnatmalar va entitlement shu yerga osiladi.
model ClientProject {
  id               String              @id @default(uuid(7)) @db.Uuid
  clientId         String              @db.Uuid @map("client_id")
  projectId        String              @db.Uuid @map("project_id")
  status           ClientProjectStatus @default(ONBOARDING)
  startedOn        DateTime?           @db.Date @map("started_on")
  endedOn          DateTime?           @db.Date @map("ended_on") // CHECK ended_on >= started_on
  accountManagerId String?             @db.Uuid @map("account_manager_id")
  defaultChannelId String?             @db.Uuid @map("default_channel_id") // yangi qurilmalar uchun (odatda stable)
  notes            String?
  rowVersion       Int                 @default(1) @map("row_version")
  createdAt        DateTime            @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt        DateTime            @updatedAt @db.Timestamptz(6) @map("updated_at")

  client         Client               @relation(fields: [clientId], references: [id], onDelete: Restrict)
  project        Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)
  accountManager User?                @relation("ClientProjectAccountManager", fields: [accountManagerId], references: [id], onDelete: Restrict)
  defaultChannel ReleaseChannel?      @relation(fields: [defaultChannelId, projectId], references: [id, projectId], onDelete: Restrict)
  subscriptions  Subscription[]
  installations  DeviceInstallation[]

  @@unique([clientId, projectId])
  @@unique([id, clientId]) // composite FK nishoni (subscriptions)
  @@unique([id, clientId, projectId]) // composite FK nishoni (device_installations)
  @@index([projectId, status])
  @@map("client_projects")
}
```

### 2.5 `devices_releases_deployments.prisma` — Devices (VPS/server/GPU/Raspberry/ESP32), Releases (TUF), Deployments

```prisma
// ─── Devices, Software Versions (Releases), Deployments ───
// Qurilmalar: VPS, oddiy server (Core i3), GPU server, Raspberry Pi, desktop, ESP32 (mikrokontroller).
// Loyiha → komponentlar → har komponentning o'z relizlari; o'rnatma = qurilmadagi komponent instansi.

enum CpuArch {
  X64
  X86
  ARM64
  ARMV7
  XTENSA // ESP32, ESP32-S2/S3
  RISCV32 // ESP32-C3/C6/H2
}

enum DeviceOwnerType {
  CLIENT // mijozning qurilmasi yoki mijozning VPS'i
  COMPANY // kompaniya infratuzilmasi (masalan, bir nechta mijozga xizmat qiluvchi VPS/GPU server)
}

enum DeviceClass {
  SERVER // oddiy server (Core i3 va h.k.)
  GPU_SERVER
  VPS
  EDGE_SBC // Raspberry Pi va boshqa single-board kompyuterlar
  MICROCONTROLLER // ESP32
  DESKTOP
  MOBILE // Android (keyingi bosqich)
}

enum DeviceManagementMode {
  AGENT // qurilmada Go agent
  FIRMWARE_OTA // ESP32 to'g'ridan-to'g'ri imzolangan firmware OTA (ADS firmware SDK)
  GATEWAY_PROXIED // ESP32 lokal tarmoqdagi agent-qurilma orqali yangilanadi
}

enum DeviceStatus {
  PENDING_APPROVAL
  ACTIVE
  DISABLED
  REVOKED
  DECOMMISSIONED
}

enum CredentialStatus {
  ACTIVE
  ROTATED
  REVOKED
}

enum InstallationStatus {
  INSTALLING
  INSTALLED
  UPDATING
  FAILED
  UNINSTALLED
}

/// Qat'iy allowlist — shell, fayl yozish, masofadan uninstall YO'Q.
enum CommandType {
  REFRESH
  RESTART_COMPONENT
  RUN_HEALTHCHECK
  COLLECT_LOGS
  ROTATE_KEY
  PAUSE_UPDATES
  RESUME_UPDATES
}

enum CommandStatus {
  QUEUED
  DELIVERED
  RUNNING
  SUCCEEDED
  FAILED
  EXPIRED
  CANCELLED
}

enum ReleaseStatus {
  DRAFT
  UPLOADING
  SCANNING
  AWAITING_SIGNATURES
  READY // TUF repo'da (threshold imzolangan)
  PUBLISHED // kanal(lar)ga chiqarilgan
  DEPRECATED
  REVOKED
}

enum ReleaseUrgency {
  NORMAL
  CRITICAL
}

enum ArtifactKind {
  SERVICE_BUNDLE // fon servisi (Node/Python/Go/.NET …) + hook'lar
  STATIC_WEB_BUNDLE
  MSI
  EXE_INSTALLER
  PORTABLE_ZIP
  CONTAINER_COMPOSE // docker-compose bundle, image'lar digest bilan pin qilingan
  MODEL_BUNDLE // AI model og'irliklari / data (GB'lab)
  FIRMWARE_IMAGE // ESP32 .bin (Secure Boot V2 bilan imzolangan)
  APK
  AGENT_BINARY
}

enum DeploymentStrategy {
  ALL_AT_ONCE
  PHASED
}

enum DeploymentStatus {
  DRAFT
  PENDING_APPROVAL
  SCHEDULED
  RUNNING
  PAUSED
  COMPLETED
  FAILED
  CANCELLED
}

enum WaveStatus {
  PENDING
  RUNNING
  SUCCEEDED
  HALTED
}

enum TargetStatus {
  PENDING
  WAITING_WINDOW
  BLOCKED_ENTITLEMENT
  DOWNLOADING
  DOWNLOADED
  INSTALLING
  VERIFYING
  SUCCEEDED
  FAILED
  ROLLED_BACK
  SKIPPED
  CANCELLED
}

model Device {
  id                    String               @id @default(uuid(7)) @db.Uuid
  code                  String               @unique // DV-001234
  ownerType             DeviceOwnerType      @default(CLIENT) @map("owner_type")
  clientId              String?              @db.Uuid @map("client_id") // CLIENT ⇔ NOT NULL (CHECK)
  siteId                String?              @db.Uuid @map("site_id") // composite FK (site_id, client_id) → client_sites
  deviceClass           DeviceClass @map("device_class")
  managementMode        DeviceManagementMode @default(AGENT) @map("management_mode")
  gatewayDeviceId       String?              @db.Uuid @map("gateway_device_id") // GATEWAY_PROXIED: uni boshqaradigan agent-qurilma
  name                  String
  hostname              String?
  platform              Platform
  arch                  CpuArch
  osName                String? @map("os_name")
  osVersion             String? @map("os_version")
  agentVersion          String? @map("agent_version") // AGENT: Go agent; FIRMWARE_OTA: firmware SDK versiyasi
  agentProtocol         Int? @map("agent_protocol")
  capabilities          String[] // "svc.migrate.v1", "compose.v1", "gpu.cuda", "selfupdate.ab.v1" …
  keyProtection         String? @map("key_protection") // tpm2 | cng-tpm | dpapi | file | esp32-nvs-encrypted | atecc608
  machineId             String? @map("machine_id") // golden image / klon aniqlash
  secureBootEnabled     Boolean? @map("secure_boot_enabled") // FIRMWARE: ESP32 Secure Boot V2 + flash encryption holati
  firmwareSecureVersion Int? @map("firmware_secure_version") // ESP32 anti-rollback (eFuse secure_version)
  lastRequestSeq        BigInt               @default(0) @map("last_request_seq") // high-water mark; orqaga ketsa — klon belgisi
  status                DeviceStatus         @default(PENDING_APPROVAL)
  isOnline              Boolean              @default(false) @map("is_online")
  lastSeenAt            DateTime?            @db.Timestamptz(6) @map("last_seen_at")
  lastIp                String?              @db.Inet @map("last_ip")
  hardware              Json? // cpu, ramMb, disk; GPU: model, vramGb, driver, cuda; ESP32: chip, flashMb
  timezone              String?
  maintenanceWindow     Json? @map("maintenance_window") // site default'ini override qiladi
  autoUpdate            Boolean              @default(true) @map("auto_update")
  enrolledAt            DateTime?            @db.Timestamptz(6) @map("enrolled_at")
  enrollmentTokenId     String?              @db.Uuid @map("enrollment_token_id")
  revokedAt             DateTime?            @db.Timestamptz(6) @map("revoked_at")
  revokeReason          String? @map("revoke_reason")
  rowVersion            Int                  @default(1) @map("row_version")
  createdAt             DateTime             @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt             DateTime             @updatedAt @db.Timestamptz(6) @map("updated_at")

  client            Client?              @relation(fields: [clientId], references: [id], onDelete: Restrict)
  site              ClientSite?          @relation(fields: [siteId, clientId], references: [id, clientId], onDelete: Restrict)
  gateway           Device?              @relation("DeviceGateway", fields: [gatewayDeviceId], references: [id], onDelete: Restrict)
  proxiedDevices    Device[]             @relation("DeviceGateway")
  enrollmentToken   EnrollmentToken?     @relation(fields: [enrollmentTokenId], references: [id], onDelete: Restrict)
  credentials       DeviceCredential[]
  installations     DeviceInstallation[]
  events            DeviceEvent[]
  commands          DeviceCommand[]
  tags              DeviceTag[]
  deploymentTargets DeploymentTarget[]

  @@index([clientId, status])
  @@index([siteId])
  @@index([status, lastSeenAt])
  @@index([deviceClass])
  @@index([gatewayDeviceId])
  @@index([machineId])
  @@map("devices")
}

model EnrollmentToken {
  id          String          @id @default(uuid(7)) @db.Uuid
  tokenHash   String          @unique @map("token_hash")
  ownerType   DeviceOwnerType @default(CLIENT) @map("owner_type")
  clientId    String?         @db.Uuid @map("client_id") // CLIENT ⇔ NOT NULL (CHECK)
  siteId      String?         @db.Uuid @map("site_id")
  projectIds  String[]        @db.Uuid @map("project_ids") // qurilmaga o'rnatiladigan loyihalar
  createdById String          @db.Uuid @map("created_by_id")
  expiresAt   DateTime        @db.Timestamptz(6) @map("expires_at") // ≤ 72 soat
  maxUses     Int             @default(1) @map("max_uses") // CHECK used_count <= max_uses
  usedCount   Int             @default(0) @map("used_count")
  revokedAt   DateTime?       @db.Timestamptz(6) @map("revoked_at")
  createdAt   DateTime        @default(now()) @db.Timestamptz(6) @map("created_at")

  client    Client?     @relation(fields: [clientId], references: [id], onDelete: Restrict)
  site      ClientSite? @relation(fields: [siteId, clientId], references: [id, clientId], onDelete: Restrict)
  createdBy User        @relation("EnrollmentTokenCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  devices   Device[]

  @@index([clientId])
  @@map("enrollment_tokens")
}

model DeviceCredential {
  id             String           @id @default(uuid(7)) @db.Uuid
  deviceId       String           @db.Uuid @map("device_id")
  algorithm      String           @default("ES256")
  publicKeyJwk   Json @map("public_key_jwk")
  thumbprint     String           @unique // RFC 7638 → JWS `kid`
  status         CredentialStatus @default(ACTIVE)
  hardwareBacked Boolean          @default(false) @map("hardware_backed")
  createdAt      DateTime         @default(now()) @db.Timestamptz(6) @map("created_at")
  rotatedAt      DateTime?        @db.Timestamptz(6) @map("rotated_at")
  revokedAt      DateTime?        @db.Timestamptz(6) @map("revoked_at")

  device Device @relation(fields: [deviceId], references: [id], onDelete: Restrict)

  @@index([deviceId])
  @@unique([deviceId], map: "device_credentials_one_active_uq", where: raw("status = 'ACTIVE'"))
  @@map("device_credentials")
}

/// Qurilmadagi komponent instansi. clientProjectId NULL — umumiy (shared) instans, faqat COMPANY qurilmada (trigger).
/// Bitta VPS'da bir nechta mijozning instansi bo'lishi mumkin.
model DeviceInstallation {
  id               String             @id @default(uuid(7)) @db.Uuid
  deviceId         String             @db.Uuid @map("device_id")
  componentId      String             @db.Uuid @map("component_id")
  projectId        String             @db.Uuid @map("project_id") // integrity anchor
  clientId         String?            @db.Uuid @map("client_id") // (client_project_id IS NULL) = (client_id IS NULL) — CHECK
  clientProjectId  String?            @db.Uuid @map("client_project_id")
  instanceName     String? @map("instance_name") // masalan "client-a-prod"
  currentReleaseId String?            @db.Uuid @map("current_release_id")
  currentVersion   String? @map("current_version") // agent hisoboti (release DB'da bo'lmasa ham)
  desiredReleaseId String?            @db.Uuid @map("desired_release_id") // deployments moduli hisoblaydi
  pinnedReleaseId  String?            @db.Uuid @map("pinned_release_id") // qo'lda "shu versiyada qolsin"
  status           InstallationStatus @default(INSTALLING)
  installPath      String? @map("install_path")
  lastReportedAt   DateTime?          @db.Timestamptz(6) @map("last_reported_at")
  lastError        String? @map("last_error")
  createdAt        DateTime           @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt        DateTime           @updatedAt @db.Timestamptz(6) @map("updated_at")

  device            Device             @relation(fields: [deviceId], references: [id], onDelete: Restrict)
  component         ProjectComponent   @relation(fields: [componentId, projectId], references: [id, projectId], onDelete: Restrict)
  clientProject     ClientProject?     @relation(fields: [clientProjectId, clientId, projectId], references: [id, clientId, projectId], onDelete: Restrict)
  currentRelease    Release?           @relation("InstallationCurrentRelease", fields: [currentReleaseId, componentId], references: [id, componentId], onDelete: Restrict)
  desiredRelease    Release?           @relation("InstallationDesiredRelease", fields: [desiredReleaseId, componentId], references: [id, componentId], onDelete: Restrict)
  pinnedRelease     Release?           @relation("InstallationPinnedRelease", fields: [pinnedReleaseId, componentId], references: [id, componentId], onDelete: Restrict)
  deploymentTargets DeploymentTarget[]

  @@unique([id, componentId, deviceId]) // composite FK nishoni (deployment_targets)
  @@unique([deviceId, componentId, clientProjectId], map: "device_installations_client_uq", where: raw("client_project_id IS NOT NULL"))
  @@unique([deviceId, componentId], map: "device_installations_shared_uq", where: raw("client_project_id IS NULL"))
  @@index([componentId, currentReleaseId])
  @@index([clientProjectId])
  @@map("device_installations")
}

/// PARTITION BY RANGE (occurred_at), 180 kun retention.
model DeviceEvent {
  id         String   @default(uuid(7)) @db.Uuid
  occurredAt DateTime @default(now()) @db.Timestamptz(6) @map("occurred_at")
  deviceId   String   @db.Uuid @map("device_id")
  type       String // ENROLLED|ONLINE|OFFLINE|KEY_ROTATED|INVENTORY_CHANGED|AGENT_UPDATED|CLOCK_SKEW|TAMPER_ALERT|SECURE_BOOT_OFF
  data       Json?

  device Device @relation(fields: [deviceId], references: [id], onDelete: Restrict)

  @@id([id, occurredAt])
  @@index([deviceId, occurredAt])
  @@map("device_events")
}

model DeviceCommand {
  id                String        @id @default(uuid(7)) @db.Uuid
  deviceId          String        @db.Uuid @map("device_id")
  type              CommandType
  params            Json // tur bo'yicha Zod schema
  status            CommandStatus @default(QUEUED)
  createdById       String        @db.Uuid @map("created_by_id")
  approvalRequestId String?       @db.Uuid @map("approval_request_id")
  expiresAt         DateTime      @db.Timestamptz(6) @map("expires_at")
  deliveredAt       DateTime?     @db.Timestamptz(6) @map("delivered_at")
  completedAt       DateTime?     @db.Timestamptz(6) @map("completed_at")
  result            Json?
  createdAt         DateTime      @default(now()) @db.Timestamptz(6) @map("created_at")

  device          Device           @relation(fields: [deviceId], references: [id], onDelete: Restrict)
  createdBy       User             @relation("DeviceCommandCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  approvalRequest ApprovalRequest? @relation(fields: [approvalRequestId], references: [id], onDelete: Restrict)

  @@index([deviceId, status])
  @@map("device_commands")
}

model DeviceTag {
  deviceId String @db.Uuid @map("device_id")
  tagId    String @db.Uuid @map("tag_id")

  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([deviceId, tagId])
  @@map("device_tags")
}

model ReleaseChannel {
  id        String  @id @default(uuid(7)) @db.Uuid
  projectId String  @db.Uuid @map("project_id")
  key       String // stable | beta | canary
  name      String
  isDefault Boolean @default(false) @map("is_default")

  project    Project               @relation(fields: [projectId], references: [id], onDelete: Restrict)
  entries    ReleaseChannelEntry[]
  defaultFor ClientProject[]

  @@unique([projectId, key])
  @@unique([id, projectId]) // composite FK nishoni
  @@unique([projectId], map: "release_channels_one_default_uq", where: raw("is_default"))
  @@map("release_channels")
}

/// Komponent relizi (versiya). Bitta loyihada komponentlar mustaqil versiyalanadi.
model Release {
  id              String         @id @default(uuid(7)) @db.Uuid
  projectId       String         @db.Uuid @map("project_id")
  componentId     String         @db.Uuid @map("component_id")
  version         String // SemVer 2.0 (CHECK regex)
  major           Int
  minor           Int
  patch           Int
  prerelease      String?
  versionCode     Int @map("version_code") // monoton; securityFloor bilan solishtiriladi (anti-rollback)
  status          ReleaseStatus  @default(DRAFT)
  securityFix     Boolean        @default(false) @map("security_fix") // SUSPENDED mijozlarga ham yetkaziladi
  urgency         ReleaseUrgency @default(NORMAL)
  minAgentVersion String? @map("min_agent_version")
  upgradeFrom     String? @map("upgrade_from") // semver oralig'i: ">=2.2.0 <2.4.1"
  releaseNotes    Json @map("release_notes") // { uz, ru, en } Markdown
  tufRole         String? @map("tuf_role") // delegated rol: "project-pos-retail"
  tufRoleVersion  Int? @map("tuf_role_version") // relizni kiritgan, threshold imzolangan metadata versiyasi
  createdById     String         @db.Uuid @map("created_by_id")
  publishedById   String?        @db.Uuid @map("published_by_id") // SoD: createdById ≠ publishedById
  publishedAt     DateTime?      @db.Timestamptz(6) @map("published_at")
  revokedAt       DateTime?      @db.Timestamptz(6) @map("revoked_at")
  revokeReason    String? @map("revoke_reason")
  rowVersion      Int            @default(1) @map("row_version")
  createdAt       DateTime       @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime       @updatedAt @db.Timestamptz(6) @map("updated_at")

  project              Project               @relation(fields: [projectId], references: [id], onDelete: Restrict)
  component            ProjectComponent      @relation(fields: [componentId, projectId], references: [id, projectId], onDelete: Restrict)
  createdBy            User                  @relation("ReleaseCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  publishedBy          User?                 @relation("ReleasePublishedBy", fields: [publishedById], references: [id], onDelete: Restrict)
  artifacts            ReleaseArtifact[]
  channelEntries       ReleaseChannelEntry[]
  deployments          Deployment[]
  deploymentTargets    DeploymentTarget[]
  installationsCurrent DeviceInstallation[]  @relation("InstallationCurrentRelease")
  installationsDesired DeviceInstallation[]  @relation("InstallationDesiredRelease")
  installationsPinned  DeviceInstallation[]  @relation("InstallationPinnedRelease")

  @@unique([componentId, version])
  @@unique([componentId, versionCode])
  @@unique([id, projectId]) // composite FK nishoni (kanallar)
  @@unique([id, componentId]) // composite FK nishoni (o'rnatmalar, deploymentlar)
  @@index([componentId, status, major, minor, patch])
  @@map("releases")
}

model ReleaseArtifact {
  id            String       @id @default(uuid(7)) @db.Uuid
  releaseId     String       @db.Uuid @map("release_id")
  platform      Platform
  arch          CpuArch
  kind          ArtifactKind
  variant       String       @default("") // "esp32s3", "cuda12", "cpu" … (bir platforma/arxitekturada bir nechta build)
  fileId        String       @db.Uuid @map("file_id")
  sha256        String // CHECK '^[0-9a-f]{64}$'
  sha512        String
  sizeBytes     BigInt @map("size_bytes") // CHECK > 0 (TUF `length`)
  tufTargetPath String       @unique @map("tuf_target_path") // "<project>/<component>/<version>/<platform>-<arch>[-variant]/<file>"
  customMeta    Json @map("custom_meta") // TUF `custom` — imzo ostida; DB nusxasi faqat UI/qidiruv uchun
  createdAt     DateTime     @default(now()) @db.Timestamptz(6) @map("created_at")

  release Release @relation(fields: [releaseId], references: [id], onDelete: Restrict)
  file    File    @relation(fields: [fileId], references: [id], onDelete: Restrict)

  @@unique([releaseId, platform, arch, kind, variant])
  @@map("release_artifacts")
}

model ReleaseChannelEntry {
  releaseId    String   @db.Uuid @map("release_id")
  channelId    String   @db.Uuid @map("channel_id")
  projectId    String   @db.Uuid @map("project_id") // release va kanal bitta loyihaga tegishli (composite FK)
  promotedById String   @db.Uuid @map("promoted_by_id")
  promotedAt   DateTime @default(now()) @db.Timestamptz(6) @map("promoted_at")

  release    Release        @relation(fields: [releaseId, projectId], references: [id, projectId], onDelete: Restrict)
  channel    ReleaseChannel @relation(fields: [channelId, projectId], references: [id, projectId], onDelete: Restrict)
  promotedBy User           @relation("ReleasePromotedBy", fields: [promotedById], references: [id], onDelete: Restrict)

  @@id([releaseId, channelId])
  @@map("release_channel_entries")
}

/// TUF metadata versiyalari (append-only). Asl fayllar S3'da: tuf/<version>.<role>.json
model TufMetadata {
  id           String   @id @default(uuid(7)) @db.Uuid
  role         String // root | targets | project-<code> | agent | firmware | snapshot | timestamp
  version      Int
  json         Json
  sha256       String
  expiresAt    DateTime @db.Timestamptz(6) @map("expires_at") // monitoring: 30/14/7 kun oldin alert
  storageKey   String @map("storage_key")
  uploadedById String?  @db.Uuid @map("uploaded_by_id")
  createdAt    DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  uploadedBy User? @relation("TufMetadataUploadedBy", fields: [uploadedById], references: [id], onDelete: Restrict)

  @@unique([role, version])
  @@index([role, expiresAt])
  @@map("tuf_metadata")
}

/// Bitta komponent relizini o'rnatmalarga yetkazish (bosqichli rollout).
model Deployment {
  id                 String             @id @default(uuid(7)) @db.Uuid
  code               String             @unique // DEP-2026-0007
  projectId          String             @db.Uuid @map("project_id")
  componentId        String             @db.Uuid @map("component_id")
  releaseId          String             @db.Uuid @map("release_id")
  strategy           DeploymentStrategy @default(PHASED)
  targetSelector     Json @map("target_selector") // client/site/device/class/tag/platform/channel filtrlari
  status             DeploymentStatus   @default(DRAFT)
  scheduledAt        DateTime?          @db.Timestamptz(6) @map("scheduled_at")
  startedAt          DateTime?          @db.Timestamptz(6) @map("started_at")
  completedAt        DateTime?          @db.Timestamptz(6) @map("completed_at")
  respectMaintenance Boolean            @default(true) @map("respect_maintenance")
  haltMinFailures    Int                @default(3) @map("halt_min_failures") // to'xtatish: xatolar ≥ 3 VA …
  haltFailureRateBp  Int                @default(200) @map("halt_failure_rate_bp") // … ulush ≥ 2% (basis points)
  autoRollback       Boolean            @default(true) @map("auto_rollback")
  allowDowngrade     Boolean            @default(false) @map("allow_downgrade") // faqat signed securityFloor'gacha
  createdById        String             @db.Uuid @map("created_by_id")
  approvalRequestId  String?            @db.Uuid @map("approval_request_id")
  rowVersion         Int                @default(1) @map("row_version")
  createdAt          DateTime           @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt          DateTime           @updatedAt @db.Timestamptz(6) @map("updated_at")

  project         Project            @relation(fields: [projectId], references: [id], onDelete: Restrict)
  component       ProjectComponent   @relation(fields: [componentId, projectId], references: [id, projectId], onDelete: Restrict)
  release         Release            @relation(fields: [releaseId, componentId], references: [id, componentId], onDelete: Restrict)
  createdBy       User               @relation("DeploymentCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  approvalRequest ApprovalRequest?   @relation(fields: [approvalRequestId], references: [id], onDelete: Restrict)
  waves           DeploymentWave[]
  targets         DeploymentTarget[]

  @@unique([id, componentId]) // composite FK nishoni
  @@index([projectId, status])
  @@index([componentId, status])
  @@map("deployments")
}

model DeploymentWave {
  id           String     @id @default(uuid(7)) @db.Uuid
  deploymentId String     @db.Uuid @map("deployment_id")
  index        Int // 0 = ring 0
  percent      Int // kumulyativ: ring0, 2, 10, 30, 100
  soakMinutes  Int        @default(1440) @map("soak_minutes") // ring 0: 120
  status       WaveStatus @default(PENDING)
  startedAt    DateTime?  @db.Timestamptz(6) @map("started_at")
  completedAt  DateTime?  @db.Timestamptz(6) @map("completed_at")

  deployment Deployment         @relation(fields: [deploymentId], references: [id], onDelete: Restrict)
  targets    DeploymentTarget[]

  @@unique([deploymentId, index])
  @@unique([id, deploymentId]) // composite FK nishoni
  @@map("deployment_waves")
}

/// installationId NULL — agent self-update (qurilmaning o'zi nishon).
model DeploymentTarget {
  id             String       @id @default(uuid(7)) @db.Uuid
  deploymentId   String       @db.Uuid @map("deployment_id")
  waveId         String       @db.Uuid @map("wave_id")
  deviceId       String       @db.Uuid @map("device_id")
  componentId    String       @db.Uuid @map("component_id")
  installationId String?      @db.Uuid @map("installation_id")
  fromVersion    String? @map("from_version")
  toReleaseId    String       @db.Uuid @map("to_release_id")
  status         TargetStatus @default(PENDING)
  attempt        Int          @default(0)
  lastAgentSeq   BigInt       @default(0) @map("last_agent_seq") // hisobotlar idempotentligi (seq ≤ last → e'tiborsiz)
  lastError      String? @map("last_error")
  startedAt      DateTime?    @db.Timestamptz(6) @map("started_at")
  finishedAt     DateTime?    @db.Timestamptz(6) @map("finished_at")
  createdAt      DateTime     @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt      DateTime     @updatedAt @db.Timestamptz(6) @map("updated_at")

  deployment   Deployment              @relation(fields: [deploymentId, componentId], references: [id, componentId], onDelete: Restrict)
  wave         DeploymentWave          @relation(fields: [waveId, deploymentId], references: [id, deploymentId], onDelete: Restrict)
  device       Device                  @relation(fields: [deviceId], references: [id], onDelete: Restrict)
  installation DeviceInstallation?     @relation(fields: [installationId, componentId, deviceId], references: [id, componentId, deviceId], onDelete: Restrict)
  toRelease    Release                 @relation(fields: [toReleaseId, componentId], references: [id, componentId], onDelete: Restrict)
  events       DeploymentTargetEvent[]

  @@index([deviceId, status])
  @@unique([deploymentId, installationId], map: "deployment_targets_installation_uq", where: raw("installation_id IS NOT NULL"))
  @@unique([deploymentId, deviceId], map: "deployment_targets_device_uq", where: raw("installation_id IS NULL"))
  // Bitta o'rnatma (yoki agent) bir vaqtda faqat BITTA faol deploymentda:
  @@unique([installationId], map: "deployment_targets_one_active_uq", where: raw("installation_id IS NOT NULL AND (status = 'PENDING' OR status = 'WAITING_WINDOW' OR status = 'DOWNLOADING' OR status = 'DOWNLOADED' OR status = 'INSTALLING' OR status = 'VERIFYING')"))
  @@unique([deviceId, componentId], map: "deployment_targets_one_active_agent_uq", where: raw("installation_id IS NULL AND (status = 'PENDING' OR status = 'WAITING_WINDOW' OR status = 'DOWNLOADING' OR status = 'DOWNLOADED' OR status = 'INSTALLING' OR status = 'VERIFYING')"))
  @@map("deployment_targets")
}

/// PARTITION BY RANGE (received_at).
model DeploymentTargetEvent {
  id         String       @default(uuid(7)) @db.Uuid
  receivedAt DateTime     @default(now()) @db.Timestamptz(6) @map("received_at")
  targetId   String       @db.Uuid @map("target_id")
  status     TargetStatus
  step       String? // agent jurnal qadami: DOWNLOADED, VERIFIED, MIGRATED …
  message    String?
  data       Json?
  agentTime  DateTime?    @db.Timestamptz(6) @map("agent_time")
  agentSeq   BigInt? @map("agent_seq")

  target DeploymentTarget @relation(fields: [targetId], references: [id], onDelete: Restrict)

  @@id([id, receivedAt])
  @@index([targetId, receivedAt])
  @@map("deployment_target_events")
}
```

### 2.6 `files_notifications_system.prisma` — Files, Notifications, Analytics, System

```prisma
// ─── Files, Notifications, Analytics, System ───

enum FileStatus {
  PENDING_UPLOAD
  UPLOADED
  SCANNING
  AVAILABLE
  QUARANTINED
  DELETED
}

enum FolderOwnerType {
  PROJECT
  CLIENT
  GENERAL
}

enum NotificationChannel {
  IN_APP
  EMAIL
  TELEGRAM
  SMS
}

enum NotificationStatus {
  QUEUED
  SENDING
  SENT
  FAILED
  READ
  CANCELLED
}

enum RecipientType {
  STAFF
  PORTAL_USER
  CLIENT_CONTACT
}

enum JobStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
}

model File {
  id                String     @id @default(uuid(7)) @db.Uuid
  storageKey        String     @unique @map("storage_key") // server generatsiya qiladi: "f/2026/11/<uuid>" — foydalanuvchi yo'li hech qachon
  bucket            String
  originalName      String @map("original_name") // sanitizatsiya qilingan
  mimeType          String @map("mime_type") // magic-bytes bo'yicha aniqlangan
  sizeBytes         BigInt @map("size_bytes")
  sha256            String?
  status            FileStatus @default(PENDING_UPLOAD)
  uploadedByType    ActorType @map("uploaded_by_type")
  uploadedById      String?    @db.Uuid @map("uploaded_by_id") // polimorf (soft reference)
  folderId          String?    @db.Uuid @map("folder_id")
  previousVersionId String?    @unique @db.Uuid @map("previous_version_id") // versiyalar zanjiri (fayl immutable)
  retentionUntil    DateTime?  @db.Timestamptz(6) @map("retention_until") // moliyaviy hujjatlar uchun majburiy saqlash
  createdAt         DateTime   @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt         DateTime   @updatedAt @db.Timestamptz(6) @map("updated_at")
  deletedAt         DateTime?  @db.Timestamptz(6) @map("deleted_at")

  folder          Folder?           @relation(fields: [folderId], references: [id], onDelete: Restrict)
  previousVersion File?             @relation("FileVersions", fields: [previousVersionId], references: [id], onDelete: Restrict)
  nextVersion     File?             @relation("FileVersions")
  attachments     FileAttachment[]
  uploadSession   UploadSession?
  artifacts       ReleaseArtifact[]
  invoicePdfs     Invoice[]         @relation("InvoicePdf")
  paymentReceipts Payment[]         @relation("PaymentReceipt")
  reportJobs      ReportJob[]

  @@index([sha256])
  @@index([folderId])
  @@map("files")
}

model Folder {
  id        String          @id @default(uuid(7)) @db.Uuid
  parentId  String?         @db.Uuid @map("parent_id")
  ownerType FolderOwnerType @map("owner_type")
  ownerId   String?         @db.Uuid @map("owner_id") // polimorf (soft reference)
  name      String
  path      String // materialized path: /<id>/<id>/
  createdAt DateTime        @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt DateTime        @updatedAt @db.Timestamptz(6) @map("updated_at")
  deletedAt DateTime?       @db.Timestamptz(6) @map("deleted_at")

  parent   Folder?  @relation("FolderTree", fields: [parentId], references: [id], onDelete: Restrict)
  children Folder[] @relation("FolderTree")
  files    File[]

  @@index([path])
  @@index([ownerType, ownerId])
  @@unique([parentId, name], map: "folders_name_active_uq", where: raw("deleted_at IS NULL"))
  @@map("folders")
}

model FileAttachment {
  id           String   @id @default(uuid(7)) @db.Uuid
  fileId       String   @db.Uuid @map("file_id")
  entityType   String @map("entity_type") // CLIENT|PROJECT|INVOICE|PAYMENT|RELEASE|DEVICE|EXPENSE …
  entityId     String   @db.Uuid @map("entity_id") // polimorf (soft reference) — orphan tekshiruvi job'i
  label        String?
  attachedById String?  @db.Uuid @map("attached_by_id")
  createdAt    DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  file File @relation(fields: [fileId], references: [id], onDelete: Restrict)

  @@unique([fileId, entityType, entityId])
  @@index([entityType, entityId])
  @@map("file_attachments")
}

model UploadSession {
  id             String    @id @default(uuid(7)) @db.Uuid
  fileId         String    @unique @db.Uuid @map("file_id")
  s3UploadId     String @map("s3_upload_id")
  partSize       Int @map("part_size")
  expectedSize   BigInt @map("expected_size")
  expectedSha256 String? @map("expected_sha256")
  status         String // OPEN | COMPLETED | ABORTED | EXPIRED
  expiresAt      DateTime  @db.Timestamptz(6) @map("expires_at")
  createdById    String?   @db.Uuid @map("created_by_id")
  createdAt      DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  file File @relation(fields: [fileId], references: [id], onDelete: Restrict)

  @@map("upload_sessions")
}

model NotificationTemplate {
  id         String              @id @default(uuid(7)) @db.Uuid
  eventType  String @map("event_type")
  channel    NotificationChannel
  locale     String
  subject    String?
  body       String // Handlebars | React Email id | Telegram MarkdownV2
  isActive   Boolean             @default(true) @map("is_active")
  rowVersion Int                 @default(1) @map("row_version")
  updatedAt  DateTime            @updatedAt @db.Timestamptz(6) @map("updated_at")

  @@unique([eventType, channel, locale])
  @@map("notification_templates")
}

model Notification {
  id            String              @id @default(uuid(7)) @db.Uuid
  eventId       String?             @db.Uuid @map("event_id") // manba outbox event
  eventType     String @map("event_type")
  recipientType RecipientType @map("recipient_type")
  recipientId   String              @db.Uuid @map("recipient_id") // polimorf (soft reference)
  channel       NotificationChannel
  status        NotificationStatus  @default(QUEUED)
  title         String
  body          String
  data          Json? // deep-link, entity id
  dedupeKey     String?             @unique @map("dedupe_key") // `${eventId}:${recipient}:${channel}`
  attempts      Int                 @default(0)
  lastError     String? @map("last_error")
  scheduledAt   DateTime            @default(now()) @db.Timestamptz(6) @map("scheduled_at") // quiet hours / digest
  sentAt        DateTime?           @db.Timestamptz(6) @map("sent_at")
  readAt        DateTime?           @db.Timestamptz(6) @map("read_at")
  createdAt     DateTime            @default(now()) @db.Timestamptz(6) @map("created_at")

  @@index([recipientType, recipientId, status, createdAt])
  @@index([status, scheduledAt])
  @@map("notifications")
}

model NotificationPreference {
  id            String              @id @default(uuid(7)) @db.Uuid
  recipientType RecipientType @map("recipient_type")
  recipientId   String              @db.Uuid @map("recipient_id")
  eventType     String @map("event_type")
  channel       NotificationChannel
  enabled       Boolean

  @@unique([recipientType, recipientId, eventType, channel])
  @@map("notification_preferences")
}

model ChannelIdentity {
  id            String              @id @default(uuid(7)) @db.Uuid
  recipientType RecipientType @map("recipient_type")
  recipientId   String              @db.Uuid @map("recipient_id")
  channel       NotificationChannel
  externalId    String @map("external_id") // Telegram chat_id
  verifiedAt    DateTime            @db.Timestamptz(6) @map("verified_at")
  isActive      Boolean             @default(true) @map("is_active")

  @@unique([channel, externalId])
  @@unique([recipientType, recipientId, channel])
  @@map("channel_identities")
}

model ChannelLinkToken {
  tokenHash     String              @id @map("token_hash")
  recipientType RecipientType @map("recipient_type")
  recipientId   String              @db.Uuid @map("recipient_id")
  channel       NotificationChannel
  expiresAt     DateTime            @db.Timestamptz(6) @map("expires_at") // 10 daqiqa, bir martalik
  usedAt        DateTime?           @db.Timestamptz(6) @map("used_at")

  @@map("channel_link_tokens")
}

model MetricSnapshot {
  id         String   @id @default(uuid(7)) @db.Uuid
  date       DateTime @db.Date
  metric     String // mrr | active_subs | devices_online | deploy_success_rate …
  dimension  String // all | project:<id> | currency:USD
  value      Decimal  @db.Decimal(20, 4) // hosila ko'rsatkich (pul emas)
  currency   Currency?
  computedAt DateTime @default(now()) @db.Timestamptz(6) @map("computed_at")

  @@unique([date, metric, dimension])
  @@map("metric_snapshots")
}

model ReportJob {
  id            String    @id @default(uuid(7)) @db.Uuid
  type          String
  params        Json
  status        JobStatus @default(QUEUED)
  fileId        String?   @db.Uuid @map("file_id")
  requestedById String    @db.Uuid @map("requested_by_id")
  createdAt     DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")
  finishedAt    DateTime? @db.Timestamptz(6) @map("finished_at")
  expiresAt     DateTime? @db.Timestamptz(6) @map("expires_at")

  file        File? @relation(fields: [fileId], references: [id], onDelete: Restrict)
  requestedBy User  @relation("ReportRequestedBy", fields: [requestedById], references: [id], onDelete: Restrict)

  @@index([requestedById, createdAt])
  @@map("report_jobs")
}

model SavedView {
  id       String  @id @default(uuid(7)) @db.Uuid
  userId   String  @db.Uuid @map("user_id")
  resource String // "clients", "invoices" …
  name     String
  filters  Json
  columns  Json
  isShared Boolean @default(false) @map("is_shared")

  user User @relation("SavedViewOwner", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, resource, name])
  @@map("saved_views")
}

model OutboxEvent {
  id            String    @id @default(uuid(7)) @db.Uuid
  type          String
  eventKey      String    @unique @map("event_key") // dedupe: "invoice.finalized:<id>" — retry'da dublikat yo'q
  version       Int       @default(1)
  aggregateType String @map("aggregate_type")
  aggregateId   String    @db.Uuid @map("aggregate_id")
  payload       Json
  correlationId String? @map("correlation_id")
  occurredAt    DateTime  @default(now()) @db.Timestamptz(6) @map("occurred_at")
  publishedAt   DateTime? @db.Timestamptz(6) @map("published_at")
  attempts      Int       @default(0)
  lastError     String? @map("last_error")

  @@index([occurredAt], map: "outbox_events_unpublished_idx", where: raw("published_at IS NULL"))
  @@map("outbox_events")
}

model ProcessedEvent {
  consumer    String
  eventId     String   @db.Uuid @map("event_id")
  processedAt DateTime @default(now()) @db.Timestamptz(6) @map("processed_at")

  @@id([consumer, eventId])
  @@map("processed_events")
}

model IdempotencyRecord {
  scope        String // actor + route
  key          String
  requestHash  String @map("request_hash")
  status       String // IN_PROGRESS | COMPLETED
  responseCode Int? @map("response_code")
  responseBody Json? @map("response_body")
  createdAt    DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  expiresAt    DateTime @db.Timestamptz(6) @map("expires_at")

  @@id([scope, key])
  @@map("idempotency_records")
}

model Setting {
  key         String   @id
  value       Json // isSecret bo'lsa shifrlangan
  isSecret    Boolean  @default(false) @map("is_secret")
  updatedById String?  @db.Uuid @map("updated_by_id")
  rowVersion  Int      @default(1) @map("row_version")
  updatedAt   DateTime @updatedAt @db.Timestamptz(6) @map("updated_at")

  updatedBy User? @relation("SettingUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  @@map("settings")
}

model FeatureFlag {
  key       String   @id
  enabled   Boolean  @default(false)
  rules     Json?
  updatedAt DateTime @updatedAt @db.Timestamptz(6) @map("updated_at")

  @@map("feature_flags")
}
```

### 2.7 `billing_finance.prisma` — Billing, Gateways, Finance

```prisma
// ─── Billing (obunalar, invoice, to'lovlar), Gateways (Payme/Click/Uzum), Finance (ledger, FX) ───
// Pul: BigInt minor units (tiyin/sent). Kurs: Decimal(18,6) — doim "1 USD = X UZS".

enum Currency {
  UZS
  USD
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  SUSPENDED
  CANCELLED
  EXPIRED
}

enum RevisionChange {
  CREATED
  PLAN_CHANGE
  QUANTITY_CHANGE
  PRICE_CHANGE
  STATUS_CHANGE
}

enum MrrMovementType {
  NEW
  EXPANSION
  CONTRACTION
  CHURN
  REACTIVATION
}

/// "Qisman to'langan" — saqlanmaydi, hosila: paidMinor > 0 va status = OPEN.
enum InvoiceStatus {
  DRAFT
  OPEN
  PAID
  VOID
  UNCOLLECTIBLE
}

enum InvoiceKind {
  RECURRING
  PRORATION
  ONE_TIME
}

enum InvoiceLineType {
  SUBSCRIPTION
  PRORATION
  ONE_TIME
  DISCOUNT
}

enum PaymentMethod {
  PAYME
  CLICK
  UZUM
  CASH
  BANK_TRANSFER
  CARD_TERMINAL
}

enum PaymentStatus {
  PENDING_APPROVAL
  POSTED
  REJECTED
}

enum RefundStatus {
  REQUESTED
  APPROVED
  SUCCEEDED
  FAILED
}

enum GatewayProvider {
  PAYME
  CLICK
  UZUM
}

enum GatewayTxState {
  PENDING
  SUCCEEDED
  CANCELLED
  REFUNDED
}

enum PaymentOrderKind {
  FIXED
  OPEN_TOPUP
}

enum FxSource {
  CBU
  MANUAL
}

enum BillingRunStatus {
  RUNNING
  COMPLETED
  COMPLETED_WITH_ERRORS
  FAILED
}

enum LedgerAccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}

// ── Tariflar ──

model Plan {
  id             String   @id @default(uuid(7)) @db.Uuid
  projectId      String   @db.Uuid @map("project_id")
  code           String
  name           String
  description    String?
  intervalMonths Int      @default(1) @map("interval_months")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt      DateTime @updatedAt @db.Timestamptz(6) @map("updated_at")

  project Project     @relation(fields: [projectId], references: [id], onDelete: Restrict)
  prices  PlanPrice[]

  @@unique([projectId, code])
  @@map("plans")
}

/// Narx tarixi — eski narx o'zgartirilmaydi. EXCLUDE: (plan_id, currency, daterange) ustma-ust emas.
model PlanPrice {
  id              String    @id @default(uuid(7)) @db.Uuid
  planId          String    @db.Uuid @map("plan_id")
  currency        Currency
  unitAmountMinor BigInt @map("unit_amount_minor")
  vatRateBp       Int       @default(0) @map("vat_rate_bp") // 1200 = 12%; hozircha firma yo'q → 0
  ikpuCode        String?   @db.VarChar(17) @map("ikpu_code") // integratsiya bosqichida (fiskalizatsiya)
  packageCode     String? @map("package_code")
  validFrom       DateTime  @db.Date @map("valid_from")
  validTo         DateTime? @db.Date @map("valid_to") // exclusive
  createdById     String    @db.Uuid @map("created_by_id")
  createdAt       DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")

  plan          Plan                       @relation(fields: [planId], references: [id], onDelete: Restrict)
  createdBy     User                       @relation("PlanPriceCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  revisionItems SubscriptionRevisionItem[]
  invoiceLines  InvoiceLine[]

  @@unique([id, currency]) // composite FK nishoni
  @@index([planId, currency, validFrom])
  @@map("plan_prices")
}

// ── Obunalar ──

model Subscription {
  id                 String             @id @default(uuid(7)) @db.Uuid
  code               String             @unique // SUB-000123
  clientId           String             @db.Uuid @map("client_id")
  clientProjectId    String             @db.Uuid @map("client_project_id")
  currency           Currency // umrbod o'zgarmaydi (trigger)
  status             SubscriptionStatus // o'tishlar — trigger jadvali
  trialEndsOn        DateTime?          @db.Date @map("trial_ends_on")
  currentPeriodStart DateTime?          @db.Date @map("current_period_start")
  currentPeriodEnd   DateTime?          @db.Date @map("current_period_end") // exclusive
  nextBillingOn      DateTime?          @db.Date @map("next_billing_on")
  paymentTermsDays   Int                @default(10) @map("payment_terms_days")
  graceDays          Int                @default(15) @map("grace_days")
  pastDueSince       DateTime?          @db.Date @map("past_due_since")
  cancelAtPeriodEnd  Boolean            @default(false) @map("cancel_at_period_end")
  endedAt            DateTime?          @db.Timestamptz(6) @map("ended_at")
  rowVersion         Int                @default(1) @map("row_version")
  createdAt          DateTime           @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt          DateTime           @updatedAt @db.Timestamptz(6) @map("updated_at")

  client        Client                 @relation(fields: [clientId], references: [id], onDelete: Restrict)
  clientProject ClientProject          @relation(fields: [clientProjectId, clientId], references: [id, clientId], onDelete: Restrict)
  revisions     SubscriptionRevision[]
  invoices      Invoice[]
  mrrSnapshots  MrrSnapshot[]

  @@unique([id, currency])
  @@unique([id, clientId, currency])
  @@index([status, nextBillingOn])
  @@index([clientId])
  @@index([clientProjectId])
  @@unique([clientProjectId], map: "subscriptions_one_live_uq", where: raw("status <> 'CANCELLED' AND status <> 'EXPIRED'")) // bitta tirik obuna
  @@map("subscriptions")
}

/// Shartlar tarixi: ustma-ust tushmaydigan vaqt oraliqlari (EXCLUDE). Append-only — faqat validTo bir marta yopiladi.
model SubscriptionRevision {
  id             String             @id @default(uuid(7)) @db.Uuid
  subscriptionId String             @db.Uuid @map("subscription_id")
  revisionNo     Int @map("revision_no")
  currency       Currency
  validFrom      DateTime           @db.Timestamptz(6) @map("valid_from")
  validTo        DateTime?          @db.Timestamptz(6) @map("valid_to") // exclusive; NULL = joriy
  status         SubscriptionStatus
  mrrMinor       BigInt @map("mrr_minor") // oylikka normallashtirilgan, chegirmadan keyin, QQSsiz
  changeType     RevisionChange @map("change_type")
  reason         String?
  actorType      ActorType? @map("actor_type")
  actorId        String?            @db.Uuid @map("actor_id") // staff yoki SYSTEM (dunning) — soft reference
  createdAt      DateTime           @default(now()) @db.Timestamptz(6) @map("created_at")

  subscription      Subscription               @relation(fields: [subscriptionId, currency], references: [id, currency], onDelete: Restrict)
  items             SubscriptionRevisionItem[]
  movement          MrrMovement?
  prorationInvoices Invoice[]                  @relation("InvoiceRevision")

  @@unique([subscriptionId, revisionNo])
  @@unique([id, currency])
  @@index([subscriptionId, validFrom])
  @@unique([subscriptionId], map: "subscription_revisions_one_open_uq", where: raw("valid_to IS NULL")) // bitta ochiq revision
  @@map("subscription_revisions")
}

model SubscriptionRevisionItem {
  id              String   @id @default(uuid(7)) @db.Uuid
  revisionId      String   @db.Uuid @map("revision_id")
  currency        Currency
  planPriceId     String   @db.Uuid @map("plan_price_id")
  quantity        Int
  unitAmountMinor BigInt @map("unit_amount_minor") // snapshot yoki kelishilgan narx
  discountBp      Int      @default(0) @map("discount_bp")

  revision  SubscriptionRevision @relation(fields: [revisionId, currency], references: [id, currency], onDelete: Restrict)
  planPrice PlanPrice            @relation(fields: [planPriceId, currency], references: [id, currency], onDelete: Restrict)

  @@unique([revisionId, planPriceId])
  @@map("subscription_revision_items")
}

model MrrMovement {
  id         String          @id @default(uuid(7)) @db.Uuid
  revisionId String          @unique @db.Uuid @map("revision_id")
  clientId   String          @db.Uuid @map("client_id")
  projectId  String          @db.Uuid @map("project_id")
  occurredAt DateTime        @db.Timestamptz(6) @map("occurred_at")
  type       MrrMovementType
  currency   Currency
  deltaMinor BigInt @map("delta_minor")

  revision SubscriptionRevision @relation(fields: [revisionId], references: [id], onDelete: Restrict)
  client   Client               @relation(fields: [clientId], references: [id], onDelete: Restrict)
  project  Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@index([occurredAt])
  @@index([clientId, occurredAt])
  @@map("mrr_movements")
}

model BillingRun {
  id         String           @id @default(uuid(7)) @db.Uuid
  runDate    DateTime         @unique @db.Date @map("run_date")
  status     BillingRunStatus @default(RUNNING)
  enqueued   Int              @default(0)
  invoiced   Int              @default(0)
  failed     Int              @default(0)
  errors     Json?
  startedAt  DateTime         @db.Timestamptz(6) @map("started_at")
  finishedAt DateTime?        @db.Timestamptz(6) @map("finished_at")

  invoices Invoice[]

  @@map("billing_runs")
}

// ── Invoice'lar ──

model Invoice {
  id                    String        @id @default(uuid(7)) @db.Uuid
  number                String?       @unique // finalizatsiyada: INV-2026-000123
  kind                  InvoiceKind
  status                InvoiceStatus @default(DRAFT)
  clientId              String        @db.Uuid @map("client_id")
  subscriptionId        String?       @db.Uuid @map("subscription_id")
  revisionId            String?       @db.Uuid @map("revision_id") // PRORATION idempotency kaliti
  billingRunId          String?       @db.Uuid @map("billing_run_id")
  currency              Currency
  periodStart           DateTime?     @db.Date @map("period_start")
  periodEnd             DateTime?     @db.Date @map("period_end")
  issueDate             DateTime?     @db.Date @map("issue_date")
  dueDate               DateTime?     @db.Date @map("due_date")
  subtotalMinor         BigInt        @default(0) @map("subtotal_minor")
  vatMinor              BigInt        @default(0) @map("vat_minor")
  totalMinor            BigInt        @default(0) @map("total_minor")
  paidMinor             BigInt        @default(0) @map("paid_minor") // FAQAT trigger (Σ allocations)
  creditedMinor         BigInt        @default(0) @map("credited_minor") // FAQAT trigger (Σ credit notes)
  fxRateId              String?       @db.Uuid @map("fx_rate_id")
  fxRate                Decimal?      @db.Decimal(18, 6) @map("fx_rate") // USD: issue kunidagi CBU kursi
  totalUzsMinor         BigInt? @map("total_uzs_minor") // carrying value
  clientSnapshot        Json? @map("client_snapshot") // finalizatsiya paytidagi rekvizitlar
  pdfFileId             String?       @db.Uuid @map("pdf_file_id")
  overdueNotifiedAt     DateTime?     @db.Timestamptz(6) @map("overdue_notified_at")
  finalizedAt           DateTime?     @db.Timestamptz(6) @map("finalized_at")
  voidedAt              DateTime?     @db.Timestamptz(6) @map("voided_at")
  voidReason            String? @map("void_reason")
  voidApprovalRequestId String?       @db.Uuid @map("void_approval_request_id")
  rowVersion            Int           @default(1) @map("row_version")
  createdAt             DateTime      @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt             DateTime      @updatedAt @db.Timestamptz(6) @map("updated_at")

  client         Client                @relation(fields: [clientId], references: [id], onDelete: Restrict)
  subscription   Subscription?         @relation(fields: [subscriptionId, clientId, currency], references: [id, clientId, currency], onDelete: Restrict)
  revision       SubscriptionRevision? @relation("InvoiceRevision", fields: [revisionId, currency], references: [id, currency], onDelete: Restrict)
  billingRun     BillingRun?           @relation(fields: [billingRunId], references: [id], onDelete: Restrict)
  fxRateRef      FxRate?               @relation("InvoiceFxRate", fields: [fxRateId], references: [id], onDelete: Restrict)
  pdfFile        File?                 @relation("InvoicePdf", fields: [pdfFileId], references: [id], onDelete: Restrict)
  voidApproval   ApprovalRequest?      @relation("InvoiceVoidApproval", fields: [voidApprovalRequestId], references: [id], onDelete: Restrict)
  lines          InvoiceLine[]
  allocations    Allocation[]
  creditNotes    CreditNote[]
  orderTargets   PaymentOrderTarget[]
  agingSnapshots ArAgingSnapshot[]

  @@unique([id, clientId])
  @@unique([id, clientId, currency])
  // Billing run idempotentligining HAQIQIY kafolati:
  @@unique([subscriptionId, periodStart], map: "invoices_one_recurring_per_period_uq", where: raw("kind = 'RECURRING' AND status <> 'VOID'"))
  @@unique([revisionId], map: "invoices_one_proration_per_revision_uq", where: raw("kind = 'PRORATION' AND status <> 'VOID'"))
  @@index([clientId, status, dueDate])
  @@index([status, dueDate])
  @@map("invoices")
}

model InvoiceLine {
  id              String          @id @default(uuid(7)) @db.Uuid
  invoiceId       String          @db.Uuid @map("invoice_id")
  position        Int
  type            InvoiceLineType
  description     String
  planPriceId     String?         @db.Uuid @map("plan_price_id")
  periodStart     DateTime?       @db.Date @map("period_start")
  periodEnd       DateTime?       @db.Date @map("period_end")
  quantity        Int
  unitAmountMinor BigInt @map("unit_amount_minor")
  prorationNum    Int             @default(1) @map("proration_num") // hisoblangan kunlar
  prorationDen    Int             @default(1) @map("proration_den") // oydagi kunlar
  amountMinor     BigInt @map("amount_minor") // CHECK = round(qty × unit × num / den)
  vatRateBp       Int             @default(0) @map("vat_rate_bp")
  vatMinor        BigInt          @default(0) @map("vat_minor") // CHECK = round(amount × bp / 10000)
  ikpuCode        String?         @db.VarChar(17) @map("ikpu_code")
  packageCode     String? @map("package_code")

  invoice   Invoice    @relation(fields: [invoiceId], references: [id], onDelete: Cascade) // faqat DRAFT o'chiriladi (trigger)
  planPrice PlanPrice? @relation(fields: [planPriceId], references: [id], onDelete: Restrict)

  @@unique([invoiceId, position])
  @@map("invoice_lines")
}

model CreditNote {
  id           String   @id @default(uuid(7)) @db.Uuid
  number       String   @unique // CN-2026-000012
  invoiceId    String   @db.Uuid @map("invoice_id")
  clientId     String   @db.Uuid @map("client_id")
  currency     Currency
  amountMinor  BigInt @map("amount_minor") // QQS bilan
  vatMinor     BigInt @map("vat_minor")
  reason       String
  issuedAt     DateTime @db.Timestamptz(6) @map("issued_at")
  createdById  String   @db.Uuid @map("created_by_id")
  approvedById String   @db.Uuid @map("approved_by_id") // CHECK ≠ createdById

  invoice    Invoice @relation(fields: [invoiceId, clientId, currency], references: [id, clientId, currency], onDelete: Restrict)
  createdBy  User    @relation("CreditNoteCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  approvedBy User    @relation("CreditNoteApprovedBy", fields: [approvedById], references: [id], onDelete: Restrict)

  @@index([invoiceId])
  @@map("credit_notes")
}

// ── To'lovlar ──

model Payment {
  id                   String        @id @default(uuid(7)) @db.Uuid
  code                 String        @unique // PAY-2026-000123
  clientId             String        @db.Uuid @map("client_id")
  method               PaymentMethod
  status               PaymentStatus // gateway: darhol POSTED; qo'lda: PENDING_APPROVAL → POSTED (four-eyes)
  currency             Currency
  amountMinor          BigInt @map("amount_minor")
  fxRateId             String?       @db.Uuid @map("fx_rate_id")
  fxRate               Decimal       @default(1) @db.Decimal(18, 6) @map("fx_rate")
  amountUzsMinor       BigInt @map("amount_uzs_minor") // qabul sanasidagi carrying value
  allocatedMinor       BigInt        @default(0) @map("allocated_minor") // FAQAT trigger
  refundedMinor        BigInt        @default(0) @map("refunded_minor") // FAQAT trigger
  receivedAt           DateTime      @db.Timestamptz(6) @map("received_at")
  gatewayTransactionId String?       @unique @db.Uuid @map("gateway_transaction_id")
  externalRef          String? @map("external_ref") // bank hujjat raqami
  receiptFileId        String?       @db.Uuid @map("receipt_file_id")
  notes                String?
  createdById          String?       @db.Uuid @map("created_by_id")
  approvedById         String?       @db.Uuid @map("approved_by_id")
  createdAt            DateTime      @default(now()) @db.Timestamptz(6) @map("created_at")

  client             Client              @relation(fields: [clientId], references: [id], onDelete: Restrict)
  fxRateRef          FxRate?             @relation("PaymentFxRate", fields: [fxRateId], references: [id], onDelete: Restrict)
  gatewayTransaction GatewayTransaction? @relation(fields: [gatewayTransactionId], references: [id], onDelete: Restrict)
  receiptFile        File?               @relation("PaymentReceipt", fields: [receiptFileId], references: [id], onDelete: Restrict)
  createdBy          User?               @relation("PaymentCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  approvedBy         User?               @relation("PaymentApprovedBy", fields: [approvedById], references: [id], onDelete: Restrict)
  allocations        Allocation[]
  refunds            Refund[]

  @@unique([id, clientId, currency])
  @@unique([method, externalRef], map: "payments_manual_ref_uq", where: raw("external_ref IS NOT NULL AND status <> 'REJECTED'"))
  @@index([clientId, status])
  @@index([receivedAt])
  @@map("payments")
}

/// Append-only; bekor qilish = aniq manfiy reversal qatori.
model Allocation {
  id                 String   @id @default(uuid(7)) @db.Uuid
  clientId           String   @db.Uuid @map("client_id")
  paymentId          String   @db.Uuid @map("payment_id")
  paymentCurrency    Currency @map("payment_currency")
  invoiceId          String   @db.Uuid @map("invoice_id")
  invoiceCurrency    Currency @map("invoice_currency")
  amountPaymentMinor BigInt @map("amount_payment_minor") // > 0 qo'llash, < 0 reversal
  amountInvoiceMinor BigInt @map("amount_invoice_minor")
  fxRateId           String?  @db.Uuid @map("fx_rate_id")
  fxRate             Decimal  @db.Decimal(18, 6) @map("fx_rate") // bir xil valyutada 1
  settledUzsMinor    BigInt @map("settled_uzs_minor") // to'lov tomonidagi carrying value
  carryingUzsMinor   BigInt @map("carrying_uzs_minor") // invoice tomonidagi carrying value
  fxDiffUzsMinor     BigInt @map("fx_diff_uzs_minor") // realized FX: foyda (+) / zarar (−)
  appliedAt          DateTime @db.Timestamptz(6) @map("applied_at")
  reversalOfId       String?  @unique @db.Uuid @map("reversal_of_id")
  createdById        String?  @db.Uuid @map("created_by_id") // staff yoki SYSTEM (allocator) — soft reference

  payment    Payment     @relation(fields: [paymentId, clientId, paymentCurrency], references: [id, clientId, currency], onDelete: Restrict)
  invoice    Invoice     @relation(fields: [invoiceId, clientId, invoiceCurrency], references: [id, clientId, currency], onDelete: Restrict)
  fxRateRef  FxRate?     @relation("AllocationFxRate", fields: [fxRateId], references: [id], onDelete: Restrict)
  reversalOf Allocation? @relation("AllocationReversal", fields: [reversalOfId], references: [id], onDelete: Restrict)
  reversedBy Allocation? @relation("AllocationReversal")

  @@index([invoiceId])
  @@index([paymentId])
  @@map("allocations")
}

model Refund {
  id                   String       @id @default(uuid(7)) @db.Uuid
  paymentId            String       @db.Uuid @map("payment_id")
  amountMinor          BigInt @map("amount_minor")
  status               RefundStatus @default(REQUESTED)
  reason               String
  gatewayTransactionId String?      @unique @db.Uuid @map("gateway_transaction_id")
  requestedById        String       @db.Uuid @map("requested_by_id")
  approvedById         String?      @db.Uuid @map("approved_by_id") // CHECK ≠ requestedById
  completedAt          DateTime?    @db.Timestamptz(6) @map("completed_at")
  createdAt            DateTime     @default(now()) @db.Timestamptz(6) @map("created_at")

  payment            Payment             @relation(fields: [paymentId], references: [id], onDelete: Restrict)
  gatewayTransaction GatewayTransaction? @relation(fields: [gatewayTransactionId], references: [id], onDelete: Restrict)
  requestedBy        User                @relation("RefundRequestedBy", fields: [requestedById], references: [id], onDelete: Restrict)
  approvedBy         User?               @relation("RefundApprovedBy", fields: [approvedById], references: [id], onDelete: Restrict)

  @@index([paymentId])
  @@map("refunds")
}

// ── Gateways ──

/// FIXED — portal/Telegram checkout (summa va kurs qulflangan); OPEN_TOPUP — mijoz accountNo bilan balans to'ldiradi.
model PaymentOrder {
  id          String           @id @default(uuid(7)) @db.Uuid
  number      String           @unique @db.VarChar(12) // tasodifiy + Luhn: gateway account / merchant_trans_id
  kind        PaymentOrderKind
  clientId    String           @db.Uuid @map("client_id")
  amountMinor BigInt? @map("amount_minor") // UZS; OPEN_TOPUP'da NULL
  fxRateId    String?          @db.Uuid @map("fx_rate_id")
  fxRate      Decimal?         @db.Decimal(18, 6) @map("fx_rate") // USD target'lar uchun muzlatilgan kotirovka
  expiresAt   DateTime         @db.Timestamptz(6) @map("expires_at")
  createdAt   DateTime         @default(now()) @db.Timestamptz(6) @map("created_at")

  client       Client               @relation(fields: [clientId], references: [id], onDelete: Restrict)
  fxRateRef    FxRate?              @relation("PaymentOrderFxRate", fields: [fxRateId], references: [id], onDelete: Restrict)
  targets      PaymentOrderTarget[]
  transactions GatewayTransaction[]

  @@unique([id, kind])
  @@unique([id, clientId])
  @@map("payment_orders")
}

model PaymentOrderTarget {
  orderId            String @db.Uuid @map("order_id")
  invoiceId          String @db.Uuid @map("invoice_id")
  clientId           String @db.Uuid @map("client_id") // buyurtma va invoice bitta mijozniki (composite FK)
  amountInvoiceMinor BigInt @map("amount_invoice_minor")
  amountUzsMinor     BigInt @map("amount_uzs_minor")

  order   PaymentOrder @relation(fields: [orderId, clientId], references: [id, clientId], onDelete: Restrict)
  invoice Invoice      @relation(fields: [invoiceId, clientId], references: [id, clientId], onDelete: Restrict)

  @@id([orderId, invoiceId])
  @@map("payment_order_targets")
}

model GatewayTransaction {
  id             String           @id @default(uuid(7)) @db.Uuid
  seq            BigInt           @unique @default(autoincrement()) // Payme "transaction", Click merchant_prepare_id
  provider       GatewayProvider
  externalId     String @map("external_id") // Payme id | click_trans_id | Uzum transId
  paymentOrderId String           @db.Uuid @map("payment_order_id")
  orderKind      PaymentOrderKind @map("order_kind")
  amountMinor    BigInt @map("amount_minor") // UZS tiyin
  state          GatewayTxState   @default(PENDING)
  providerTime   DateTime         @db.Timestamptz(6) @map("provider_time") // Payme `time` (12 soat timeout asosi)
  performedAt    DateTime?        @db.Timestamptz(6) @map("performed_at")
  cancelledAt    DateTime?        @db.Timestamptz(6) @map("cancelled_at")
  cancelReason   Int? @map("cancel_reason")
  fiscalData     Json? @map("fiscal_data") // Payme SetFiscalData
  createdAt      DateTime         @default(now()) @db.Timestamptz(6) @map("created_at")

  paymentOrder PaymentOrder @relation(fields: [paymentOrderId, orderKind], references: [id, kind], onDelete: Restrict)
  payment      Payment?
  refund       Refund?

  @@unique([provider, externalId])
  @@unique([paymentOrderId], map: "gateway_transactions_one_live_fixed_uq", where: raw("order_kind = 'FIXED' AND (state = 'PENDING' OR state = 'SUCCEEDED')"))
  @@map("gateway_transactions")
}

/// Append-only, PARTITION BY RANGE (received_at), ≥ 5 yil saqlanadi.
model GatewayEvent {
  id         String          @default(uuid(7)) @db.Uuid
  receivedAt DateTime        @default(now()) @db.Timestamptz(6) @map("received_at")
  provider   GatewayProvider
  method     String
  externalId String? @map("external_id")
  rawBody    String @map("raw_body") // aynan matn: imzolar xom qiymatlar bo'yicha hisoblanadi
  request    Json?
  response   Json?
  httpStatus Int @map("http_status")
  authOk     Boolean @map("auth_ok")
  sourceIp   String?         @db.Inet @map("source_ip")
  durationMs Int? @map("duration_ms")

  @@id([id, receivedAt])
  @@index([provider, externalId])
  @@map("gateway_events")
}

model PaymentProviderConfig {
  provider   GatewayProvider @id
  enabled    Boolean         @default(false)
  merchantId String @map("merchant_id")
  secretEnc  Bytes @map("secret_enc")
  keyVersion Int @map("key_version")
  testMode   Boolean         @default(true) @map("test_mode")
  allowedIps String[] @map("allowed_ips")
  rowVersion Int             @default(1) @map("row_version")
  updatedAt  DateTime        @updatedAt @db.Timestamptz(6) @map("updated_at")

  @@map("payment_provider_configs")
}

// ── Finance ──

model FxRate {
  id            String   @id @default(uuid(7)) @db.Uuid
  source        FxSource
  base          Currency
  quote         Currency
  effectiveDate DateTime @db.Date @map("effective_date")
  rate          Decimal  @db.Decimal(18, 6) // CBU Rate / Nominal
  fetchedAt     DateTime @default(now()) @db.Timestamptz(6) @map("fetched_at")
  rawPayload    Json? @map("raw_payload")
  createdById   String?  @db.Uuid @map("created_by_id") // MANUAL bo'lsa majburiy (CHECK)

  createdBy     User?          @relation("FxRateCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  invoices      Invoice[]      @relation("InvoiceFxRate")
  payments      Payment[]      @relation("PaymentFxRate")
  allocations   Allocation[]   @relation("AllocationFxRate")
  paymentOrders PaymentOrder[] @relation("PaymentOrderFxRate")

  @@unique([source, base, quote, effectiveDate])
  @@map("fx_rates")
}

/// 1000 Kassa · 1020 Bank · 1150/1151/1152 Clearing (Payme/Click/Uzum) · 1200 AR · 2100 Avanslar · 2200 QQS
/// 4000 Daromad · 6100 Gateway komissiyasi · 7100/7200 FX foyda/zarar (realized) · 7150/7250 (unrealized, oy oxiri)
model LedgerAccount {
  code String            @id
  name String
  type LedgerAccountType

  lines JournalLine[]

  @@map("ledger_accounts")
}

model JournalEntry {
  id             String   @id @default(uuid(7)) @db.Uuid
  idempotencyKey String   @unique @map("idempotency_key") // "invoice:<id>:finalize"
  effectiveDate  DateTime @db.Date @map("effective_date") // yopilgan davrga yozib bo'lmaydi (trigger)
  sourceType     String @map("source_type")
  sourceId       String   @db.Uuid @map("source_id")
  description    String?
  postedAt       DateTime @default(now()) @db.Timestamptz(6) @map("posted_at")

  lines JournalLine[]

  @@index([sourceType, sourceId])
  @@index([effectiveDate])
  @@map("journal_entries")
}

/// Ishorali summa: debit > 0, credit < 0. Har entry bo'yicha Σ amountUzsMinor = 0 (deferred trigger).
model JournalLine {
  id             BigInt   @id @default(autoincrement())
  entryId        String   @db.Uuid @map("entry_id")
  accountCode    String @map("account_code")
  clientId       String?  @db.Uuid @map("client_id")
  projectId      String?  @db.Uuid @map("project_id")
  currency       Currency
  amountMinor    BigInt @map("amount_minor")
  amountUzsMinor BigInt @map("amount_uzs_minor")

  entry   JournalEntry  @relation(fields: [entryId], references: [id], onDelete: Restrict)
  account LedgerAccount @relation(fields: [accountCode], references: [code], onDelete: Restrict)
  client  Client?       @relation(fields: [clientId], references: [id], onDelete: Restrict)
  project Project?      @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@index([entryId])
  @@index([accountCode, clientId, currency])
  @@map("journal_lines")
}

model FinancialPeriod {
  month        DateTime  @id @db.Date // oyning 1-sanasi
  fxRevaluedAt DateTime? @db.Timestamptz(6) @map("fx_revalued_at") // oy oxiri USD AR qayta baholandi (yopishdan oldin majburiy)
  closedAt     DateTime? @db.Timestamptz(6) @map("closed_at")
  closedById String?   @db.Uuid @map("closed_by_id")

  closedBy User? @relation("PeriodClosedBy", fields: [closedById], references: [id], onDelete: Restrict)

  @@map("financial_periods")
}

/// Gapless raqamlash: UPDATE … SET next_value = next_value + 1 … RETURNING (tranzaksiya ichida).
model DocumentSequence {
  series    String // INV | CN | PAY | SUB | CL | DV | DEP
  year      Int
  nextValue Int    @default(1) @map("next_value")

  @@id([series, year])
  @@map("document_sequences")
}

model MrrSnapshot {
  month          DateTime @db.Date
  subscriptionId String   @db.Uuid @map("subscription_id")
  clientId       String   @db.Uuid @map("client_id")
  projectId      String   @db.Uuid @map("project_id")
  currency       Currency
  mrrMinor       BigInt @map("mrr_minor")
  fxRate         Decimal  @db.Decimal(18, 6) @map("fx_rate")
  mrrUzsMinor    BigInt @map("mrr_uzs_minor")

  subscription Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Restrict)

  @@id([month, subscriptionId])
  @@index([month, projectId])
  @@map("mrr_snapshots")
}

model ArAgingSnapshot {
  asOf                DateTime @db.Date @map("as_of")
  invoiceId           String   @db.Uuid @map("invoice_id")
  clientId            String   @db.Uuid @map("client_id")
  currency            Currency
  outstandingMinor    BigInt @map("outstanding_minor")
  outstandingUzsMinor BigInt @map("outstanding_uzs_minor")
  daysPastDue         Int @map("days_past_due")

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)

  @@id([asOf, invoiceId])
  @@index([asOf, clientId])
  @@map("ar_aging_snapshots")
}

model Expense {
  id             String   @id @default(uuid(7)) @db.Uuid
  category       String
  projectId      String?  @db.Uuid @map("project_id")
  currency       Currency
  amountMinor    BigInt @map("amount_minor")
  fxRate         Decimal  @default(1) @db.Decimal(18, 6) @map("fx_rate")
  amountUzsMinor BigInt @map("amount_uzs_minor")
  spentOn        DateTime @db.Date @map("spent_on")
  description    String?
  createdById    String   @db.Uuid @map("created_by_id")
  createdAt      DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  project   Project? @relation(fields: [projectId], references: [id], onDelete: Restrict)
  createdBy User     @relation("ExpenseCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)

  @@index([spentOn])
  @@map("expenses")
}
```

