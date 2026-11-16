# ER diagrammalar

> ADS-ERP arxitektura hujjatlari · tasdiqlangan reja (2026-11-10) asosida · [Hujjatlar indeksi](../../README.md)

## 5. Ma'lumotlar bazasi: ER diagrammalar

### 5.1 Umumiy (aggregate darajasida) ER
```mermaid
erDiagram
  CLIENT ||--o{ CLIENT_CONTACT : has
  CLIENT ||--o{ CLIENT_SITE : has
  CLIENT ||--o{ PORTAL_USER : "login'lari"
  CLIENT ||--o{ CLIENT_PROJECT : uses
  PROJECT ||--o{ CLIENT_PROJECT : serves
  PROJECT ||--o{ PROJECT_MEMBER : team
  PROJECT ||--|{ PROJECT_COMPONENT : "qismlar (VPS, GPU, ESP32 …)"
  PROJECT ||--o{ PLAN : offers
  PLAN ||--|{ PLAN_PRICE : "narx tarixi"
  CLIENT_PROJECT ||--o{ SUBSCRIPTION : "bitta tirik"
  SUBSCRIPTION ||--|{ SUBSCRIPTION_REVISION : "shartlar tarixi"
  PLAN_PRICE ||--o{ SUBSCRIPTION_REVISION : "narx snapshot (item)"
  SUBSCRIPTION ||--o{ INVOICE : generates
  CLIENT ||--o{ INVOICE : "billed to"
  INVOICE ||--|{ INVOICE_LINE : contains
  CLIENT ||--o{ PAYMENT : pays
  PAYMENT ||--o{ ALLOCATION : splits
  INVOICE ||--o{ ALLOCATION : "settled by"
  GATEWAY_TRANSACTION |o--o| PAYMENT : produces
  CLIENT ||--o{ JOURNAL_LINE : "akt-sverka (clientId)"
  CLIENT |o--o{ DEVICE : "egasi (COMPANY qurilmada yo'q)"
  CLIENT_SITE ||--o{ DEVICE : hosts
  DEVICE |o--o{ DEVICE : "gateway (ESP32)"
  DEVICE ||--o{ DEVICE_INSTALLATION : "instanslar"
  PROJECT_COMPONENT ||--o{ DEVICE_INSTALLATION : "o'rnatilgan"
  CLIENT_PROJECT |o--o{ DEVICE_INSTALLATION : "entitles (shared'da yo'q)"
  PROJECT_COMPONENT ||--o{ RELEASE : versions
  RELEASE ||--|{ RELEASE_ARTIFACT : "platforma bo'yicha"
  FILE ||--o| RELEASE_ARTIFACT : stores
  RELEASE ||--o{ DEPLOYMENT : "rolled out by"
  DEPLOYMENT ||--|{ DEPLOYMENT_WAVE : phases
  DEPLOYMENT ||--o{ DEPLOYMENT_TARGET : targets
  DEVICE ||--o{ DEPLOYMENT_TARGET : receives
  USER ||--o{ USER_ROLE_ASSIGNMENT : has
  ROLE ||--o{ USER_ROLE_ASSIGNMENT : "assigned (scope)"
  ROLE ||--o{ ROLE_PERMISSION : grants
  PERMISSION ||--o{ ROLE_PERMISSION : "granted in"
```
**Asosiy g'oya:** M:N munosabat `CLIENT_PROJECT` — o'z atributlari bor **birinchi darajali entity** (status, menejer, default kanal). Obunalar, qurilmadagi o'rnatmalar va entitlement aynan shu bog'lanishga osiladi — shuning uchun "bu mijoz bu loyihani ishlatadimi va to'laganmi?" savoliga bitta joydan javob olinadi.

### 5.2 IAM, Approvals, Audit
```mermaid
erDiagram
  USER ||--o{ SESSION : "STAFF sessiyalar"
  PORTAL_USER ||--o{ SESSION : "PORTAL sessiyalar"
  USER ||--o{ MFA_FACTOR : "TOTP"
  USER ||--o{ PASSKEY : "WebAuthn"
  USER ||--o{ API_KEY : "service account"
  USER ||--o{ USER_ROLE_ASSIGNMENT : ""
  ROLE ||--o{ USER_ROLE_ASSIGNMENT : ""
  ROLE ||--o{ ROLE_PERMISSION : ""
  PERMISSION ||--o{ ROLE_PERMISSION : ""
  CLIENT ||--o{ PORTAL_USER : ""
  CLIENT_CONTACT |o--o| PORTAL_USER : "kontakt → login"
  USER ||--o{ APPROVAL_REQUEST : "so'raydi (maker)"
  APPROVAL_REQUEST ||--o{ APPROVAL_DECISION : ""
  USER ||--o{ APPROVAL_DECISION : "tasdiqlaydi (checker)"
  AUDIT_SEAL ||--o{ AUDIT_LOG : "muhrlaydi (seq oralig'i)"
  USER_ROLE_ASSIGNMENT {
    uuid userId FK
    uuid roleId FK
    enum scopeType "GLOBAL|PROJECT|CLIENT"
    uuid scopeId "nullable"
  }
  AUDIT_LOG {
    uuid id PK
    timestamptz occurredAt PK "partition key"
    bigint seq
    enum actorType
    string action
    string resourceType
    json changes "redacted before/after"
  }
```

### 5.3 Devices, Releases, Deployments, Files
```mermaid
erDiagram
  CLIENT ||--o{ ENROLLMENT_TOKEN : ""
  ENROLLMENT_TOKEN ||--o{ DEVICE : "enroll qiladi"
  DEVICE ||--|{ DEVICE_CREDENTIAL : "kalitlar (1 ta ACTIVE)"
  DEVICE ||--o{ DEVICE_EVENT : "append-only"
  DEVICE ||--o{ DEVICE_COMMAND : "allowlist buyruqlar"
  DEVICE ||--o{ DEVICE_INSTALLATION : ""
  DEVICE |o--o{ DEVICE : "gateway → ESP32"
  PROJECT_COMPONENT ||--o{ RELEASE : "komponent relizlari"
  PROJECT_COMPONENT ||--o{ DEVICE_INSTALLATION : ""
  DEVICE ||--o{ DEVICE_TAG : ""
  PROJECT ||--o{ RELEASE_CHANNEL : "stable/beta/canary"
  RELEASE ||--o{ RELEASE_CHANNEL_ENTRY : "promote"
  RELEASE_CHANNEL ||--o{ RELEASE_CHANNEL_ENTRY : ""
  RELEASE ||--|{ RELEASE_ARTIFACT : ""
  TUF_METADATA ||--o{ RELEASE : "delegated rol versiyasi (threshold imzo)"
  RELEASE_ARTIFACT }o--|| FILE : ""
  DEPLOYMENT }o--|| RELEASE : ""
  DEPLOYMENT ||--|{ DEPLOYMENT_WAVE : ""
  DEPLOYMENT_WAVE ||--o{ DEPLOYMENT_TARGET : ""
  DEPLOYMENT_TARGET }o--|| DEVICE : ""
  DEPLOYMENT_TARGET }o--o| DEVICE_INSTALLATION : "instans (agent self-update'da yo'q)"
  DEPLOYMENT_TARGET ||--o{ DEPLOYMENT_TARGET_EVENT : "agent hisobotlari"
  DEVICE_INSTALLATION }o--o| RELEASE : "current / desired"
  FILE ||--o{ FILE_ATTACHMENT : "polimorf biriktirish"
  FOLDER ||--o{ FILE : ""
  FOLDER ||--o{ FOLDER : "daraxt"
  FILE |o--o| FILE : "previousVersion"
```

### 5.4 Notifications va System
```mermaid
erDiagram
  OUTBOX_EVENT ||--o{ NOTIFICATION : "trigger"
  NOTIFICATION_TEMPLATE ||--o{ NOTIFICATION : "render (event×kanal×til)"
  NOTIFICATION_PREFERENCE }o--|| USER : "yoki PORTAL_USER"
  CHANNEL_IDENTITY }o--|| USER : "Telegram chat_id"
  OUTBOX_EVENT ||--o{ PROCESSED_EVENT : "consumer idempotency"
```
Billing/Finance ER — quyida 5.5 da.

### 5.5 Billing/Finance ER (7.3 bo'limidan)
```mermaid
erDiagram
  PROJECT ||--o{ PLAN : offers
  PLAN ||--|{ PLAN_PRICE : "validFrom/validTo (EXCLUDE)"
  CLIENT_PROJECT ||--o{ SUBSCRIPTION : "bitta tirik"
  SUBSCRIPTION ||--|{ SUBSCRIPTION_REVISION : "vaqt oraliqlari"
  SUBSCRIPTION_REVISION ||--|{ SUBSCRIPTION_REVISION_ITEM : "narx snapshot"
  PLAN_PRICE ||--o{ SUBSCRIPTION_REVISION_ITEM : ""
  SUBSCRIPTION_REVISION ||--o| MRR_MOVEMENT : "NEW/EXPANSION/..."
  SUBSCRIPTION ||--o{ INVOICE : "RECURRING: davrga bitta"
  SUBSCRIPTION_REVISION ||--o| INVOICE : "PRORATION: revisionga bitta"
  INVOICE ||--|{ INVOICE_LINE : "IKPU, QQS"
  INVOICE ||--o{ CREDIT_NOTE : tuzatish
  INVOICE_SEQUENCE ||--o{ INVOICE : "gapless raqam"
  FX_RATE ||--o{ INVOICE : "issue kursi"
  CLIENT ||--o{ PAYMENT_ORDER : "FIXED / OPEN_TOPUP"
  PAYMENT_ORDER ||--o{ PAYMENT_ORDER_TARGET : ""
  INVOICE ||--o{ PAYMENT_ORDER_TARGET : ""
  PAYMENT_ORDER ||--o{ GATEWAY_TRANSACTION : ""
  GATEWAY_TRANSACTION |o--o| PAYMENT : "capture"
  CLIENT ||--o{ PAYMENT : ""
  PAYMENT ||--o{ ALLOCATION : "append-only"
  INVOICE ||--o{ ALLOCATION : ""
  PAYMENT ||--o{ REFUND : ""
  JOURNAL_ENTRY ||--|{ JOURNAL_LINE : "Σ amountUzs = 0"
  LEDGER_ACCOUNT ||--o{ JOURNAL_LINE : ""
  FINANCIAL_PERIOD ||--o{ JOURNAL_ENTRY : "yopiq davrga yozilmaydi"
```
