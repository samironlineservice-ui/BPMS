-- ADS-ERP 0001_init — Prisma DDL (4 jadval PARTITION BY RANGE) + integrity.sql (docs/architecture/database/integrity.sql)
-- Ishga tushiruvchi: app_migrator (jadvallar egasi). Rollar app_rw/app_portal/app_readonly oldindan mavjud bo'lishi shart.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('STAFF', 'PORTAL_USER', 'DEVICE', 'SYSTEM', 'GATEWAY', 'API_KEY');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UZS', 'USD');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RevisionChange" AS ENUM ('CREATED', 'PLAN_CHANGE', 'QUANTITY_CHANGE', 'PRICE_CHANGE', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "MrrMovementType" AS ENUM ('NEW', 'EXPANSION', 'CONTRACTION', 'CHURN', 'REACTIVATION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('RECURRING', 'PRORATION', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "InvoiceLineType" AS ENUM ('SUBSCRIPTION', 'PRORATION', 'ONE_TIME', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYME', 'CLICK', 'UZUM', 'CASH', 'BANK_TRANSFER', 'CARD_TERMINAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_APPROVAL', 'POSTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('PAYME', 'CLICK', 'UZUM');

-- CreateEnum
CREATE TYPE "GatewayTxState" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentOrderKind" AS ENUM ('FIXED', 'OPEN_TOPUP');

-- CreateEnum
CREATE TYPE "FxSource" AS ENUM ('CBU', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('LEAD', 'ACTIVE', 'SUSPENDED', 'CHURNED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('CLIENT', 'DEVICE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_DEVELOPMENT', 'ACTIVE', 'MAINTENANCE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('LEAD', 'DEVELOPER', 'QA', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ClientProjectStatus" AS ENUM ('PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CHURNED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WINDOWS', 'LINUX', 'ANDROID', 'ESP_IDF');

-- CreateEnum
CREATE TYPE "ComponentRuntime" AS ENUM ('SERVER_SERVICE', 'CONTAINER_STACK', 'STATIC_WEB', 'DESKTOP_APP', 'FIRMWARE', 'AI_MODEL', 'MOBILE_APP');

-- CreateEnum
CREATE TYPE "CpuArch" AS ENUM ('X64', 'X86', 'ARM64', 'ARMV7', 'XTENSA', 'RISCV32');

-- CreateEnum
CREATE TYPE "DeviceOwnerType" AS ENUM ('CLIENT', 'COMPANY');

-- CreateEnum
CREATE TYPE "DeviceClass" AS ENUM ('SERVER', 'GPU_SERVER', 'VPS', 'EDGE_SBC', 'MICROCONTROLLER', 'DESKTOP', 'MOBILE');

-- CreateEnum
CREATE TYPE "DeviceManagementMode" AS ENUM ('AGENT', 'FIRMWARE_OTA', 'GATEWAY_PROXIED');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REVOKED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('INSTALLING', 'INSTALLED', 'UPDATING', 'FAILED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "CommandType" AS ENUM ('REFRESH', 'RESTART_COMPONENT', 'RUN_HEALTHCHECK', 'COLLECT_LOGS', 'ROTATE_KEY', 'PAUSE_UPDATES', 'RESUME_UPDATES');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('QUEUED', 'DELIVERED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'UPLOADING', 'SCANNING', 'AWAITING_SIGNATURES', 'READY', 'PUBLISHED', 'DEPRECATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReleaseUrgency" AS ENUM ('NORMAL', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('SERVICE_BUNDLE', 'STATIC_WEB_BUNDLE', 'MSI', 'EXE_INSTALLER', 'PORTABLE_ZIP', 'CONTAINER_COMPOSE', 'MODEL_BUNDLE', 'FIRMWARE_IMAGE', 'APK', 'AGENT_BINARY');

-- CreateEnum
CREATE TYPE "DeploymentStrategy" AS ENUM ('ALL_AT_ONCE', 'PHASED');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaveStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'HALTED');

-- CreateEnum
CREATE TYPE "TargetStatus" AS ENUM ('PENDING', 'WAITING_WINDOW', 'BLOCKED_ENTITLEMENT', 'DOWNLOADING', 'DOWNLOADED', 'INSTALLING', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'SCANNING', 'AVAILABLE', 'QUARANTINED', 'DELETED');

-- CreateEnum
CREATE TYPE "FolderOwnerType" AS ENUM ('PROJECT', 'CLIENT', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'TELEGRAM', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'READ', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('STAFF', 'PORTAL_USER', 'CLIENT_CONTACT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AuthRealm" AS ENUM ('STAFF', 'PORTAL');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('GLOBAL', 'PROJECT', 'CLIENT');

-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('OWNER', 'ACCOUNTANT', 'TECHNICIAN', 'VIEWER');

-- CreateTable
CREATE TABLE "approval_policies" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required_approvals" INTEGER NOT NULL DEFAULT 1,
    "approver_permission" TEXT NOT NULL,
    "threshold_minor" BIGINT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allow_self_approval" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "policy_key" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "required_approvals" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "approve" BOOLEAN NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "actor_label" TEXT,
    "impersonator_id" UUID,
    "ip" INET,
    "user_agent" TEXT,
    "request_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "result" "AuditResult" NOT NULL,
    "reason" TEXT,
    "changes" JSONB,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");

-- CreateTable
CREATE TABLE "audit_seals" (
    "id" UUID NOT NULL,
    "from_seq" BIGINT NOT NULL,
    "to_seq" BIGINT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "chain_hash" TEXT NOT NULL,
    "prev_seal_hash" TEXT,
    "signature" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_seals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interval_months" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "unit_amount_minor" BIGINT NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL DEFAULT 0,
    "ikpu_code" VARCHAR(17),
    "package_code" TEXT,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "client_project_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "trial_ends_on" DATE,
    "current_period_start" DATE,
    "current_period_end" DATE,
    "next_billing_on" DATE,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 10,
    "grace_days" INTEGER NOT NULL DEFAULT 15,
    "past_due_since" DATE,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "ended_at" TIMESTAMPTZ(6),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_revisions" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "status" "SubscriptionStatus" NOT NULL,
    "mrr_minor" BIGINT NOT NULL,
    "change_type" "RevisionChange" NOT NULL,
    "reason" TEXT,
    "actor_type" "ActorType",
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_revision_items" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "plan_price_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_amount_minor" BIGINT NOT NULL,
    "discount_bp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscription_revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrr_movements" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "type" "MrrMovementType" NOT NULL,
    "currency" "Currency" NOT NULL,
    "delta_minor" BIGINT NOT NULL,

    CONSTRAINT "mrr_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_runs" (
    "id" UUID NOT NULL,
    "run_date" DATE NOT NULL,
    "status" "BillingRunStatus" NOT NULL DEFAULT 'RUNNING',
    "enqueued" INTEGER NOT NULL DEFAULT 0,
    "invoiced" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "billing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "client_id" UUID NOT NULL,
    "subscription_id" UUID,
    "revision_id" UUID,
    "billing_run_id" UUID,
    "currency" "Currency" NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "issue_date" DATE,
    "due_date" DATE,
    "subtotal_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_minor" BIGINT NOT NULL DEFAULT 0,
    "total_minor" BIGINT NOT NULL DEFAULT 0,
    "paid_minor" BIGINT NOT NULL DEFAULT 0,
    "credited_minor" BIGINT NOT NULL DEFAULT 0,
    "fx_rate_id" UUID,
    "fx_rate" DECIMAL(18,6),
    "total_uzs_minor" BIGINT,
    "client_snapshot" JSONB,
    "pdf_file_id" UUID,
    "overdue_notified_at" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "void_approval_request_id" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "InvoiceLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "plan_price_id" UUID,
    "period_start" DATE,
    "period_end" DATE,
    "quantity" INTEGER NOT NULL,
    "unit_amount_minor" BIGINT NOT NULL,
    "proration_num" INTEGER NOT NULL DEFAULT 1,
    "proration_den" INTEGER NOT NULL DEFAULT 1,
    "amount_minor" BIGINT NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL DEFAULT 0,
    "vat_minor" BIGINT NOT NULL DEFAULT 0,
    "ikpu_code" VARCHAR(17),
    "package_code" TEXT,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "vat_minor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "fx_rate_id" UUID,
    "fx_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amount_uzs_minor" BIGINT NOT NULL,
    "allocated_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "gateway_transaction_id" UUID,
    "external_ref" TEXT,
    "receipt_file_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "approved_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "payment_currency" "Currency" NOT NULL,
    "invoice_id" UUID NOT NULL,
    "invoice_currency" "Currency" NOT NULL,
    "amount_payment_minor" BIGINT NOT NULL,
    "amount_invoice_minor" BIGINT NOT NULL,
    "fx_rate_id" UUID,
    "fx_rate" DECIMAL(18,6) NOT NULL,
    "settled_uzs_minor" BIGINT NOT NULL,
    "carrying_uzs_minor" BIGINT NOT NULL,
    "fx_diff_uzs_minor" BIGINT NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL,
    "reversal_of_id" UUID,
    "created_by_id" UUID,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "gateway_transaction_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" UUID NOT NULL,
    "number" VARCHAR(12) NOT NULL,
    "kind" "PaymentOrderKind" NOT NULL,
    "client_id" UUID NOT NULL,
    "amount_minor" BIGINT,
    "fx_rate_id" UUID,
    "fx_rate" DECIMAL(18,6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_order_targets" (
    "order_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "amount_invoice_minor" BIGINT NOT NULL,
    "amount_uzs_minor" BIGINT NOT NULL,

    CONSTRAINT "payment_order_targets_pkey" PRIMARY KEY ("order_id","invoice_id")
);

-- CreateTable
CREATE TABLE "gateway_transactions" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "provider" "GatewayProvider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "payment_order_id" UUID NOT NULL,
    "order_kind" "PaymentOrderKind" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "state" "GatewayTxState" NOT NULL DEFAULT 'PENDING',
    "provider_time" TIMESTAMPTZ(6) NOT NULL,
    "performed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" INTEGER,
    "fiscal_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_events" (
    "id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" "GatewayProvider" NOT NULL,
    "method" TEXT NOT NULL,
    "external_id" TEXT,
    "raw_body" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "http_status" INTEGER NOT NULL,
    "auth_ok" BOOLEAN NOT NULL,
    "source_ip" INET,
    "duration_ms" INTEGER,

    CONSTRAINT "gateway_events_pkey" PRIMARY KEY ("id","received_at")
) PARTITION BY RANGE ("received_at");

-- CreateTable
CREATE TABLE "payment_provider_configs" (
    "provider" "GatewayProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "merchant_id" TEXT NOT NULL,
    "secret_enc" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "allowed_ips" TEXT[],
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_provider_configs_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL,
    "source" "FxSource" NOT NULL,
    "base" "Currency" NOT NULL,
    "quote" "Currency" NOT NULL,
    "effective_date" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload" JSONB,
    "created_by_id" UUID,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "description" TEXT,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" BIGSERIAL NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_code" TEXT NOT NULL,
    "client_id" UUID,
    "project_id" UUID,
    "currency" "Currency" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "amount_uzs_minor" BIGINT NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_periods" (
    "month" DATE NOT NULL,
    "fx_revalued_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_id" UUID,

    CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("series","year")
);

-- CreateTable
CREATE TABLE "mrr_snapshots" (
    "month" DATE NOT NULL,
    "subscription_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "mrr_minor" BIGINT NOT NULL,
    "fx_rate" DECIMAL(18,6) NOT NULL,
    "mrr_uzs_minor" BIGINT NOT NULL,

    CONSTRAINT "mrr_snapshots_pkey" PRIMARY KEY ("month","subscription_id")
);

-- CreateTable
CREATE TABLE "ar_aging_snapshots" (
    "as_of" DATE NOT NULL,
    "invoice_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "outstanding_minor" BIGINT NOT NULL,
    "outstanding_uzs_minor" BIGINT NOT NULL,
    "days_past_due" INTEGER NOT NULL,

    CONSTRAINT "ar_aging_snapshots_pkey" PRIMARY KEY ("as_of","invoice_id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "project_id" UUID,
    "currency" "Currency" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "fx_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amount_uzs_minor" BIGINT NOT NULL,
    "spent_on" DATE NOT NULL,
    "description" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "ClientType" NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "tin" VARCHAR(9),
    "pinfl_enc" BYTEA,
    "pinfl_hash" TEXT,
    "vat_payer" BOOLEAN NOT NULL DEFAULT false,
    "legal_address" TEXT,
    "region" TEXT,
    "bank_name" TEXT,
    "bank_mfo" VARCHAR(5),
    "bank_account" VARCHAR(20),
    "billing_email" TEXT,
    "phone" TEXT,
    "preferred_locale" TEXT NOT NULL DEFAULT 'uz',
    "billing_currency" "Currency" NOT NULL DEFAULT 'UZS',
    "account_no" VARCHAR(8) NOT NULL,
    "is_resident" BOOLEAN NOT NULL DEFAULT true,
    "status" "ClientStatus" NOT NULL DEFAULT 'LEAD',
    "account_manager_id" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "telegram" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_billing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_sites" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "region" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "maintenance_window" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "client_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_notes" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "scope" "TagScope" NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_tags" (
    "client_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("client_id","tag_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "owner_id" UUID,
    "repository_url" TEXT,
    "supported_platforms" "Platform"[],
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_components" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "runtime" "ComponentRuntime" NOT NULL,
    "supported_platforms" "Platform"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "client_projects" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "ClientProjectStatus" NOT NULL DEFAULT 'ONBOARDING',
    "started_on" DATE,
    "ended_on" DATE,
    "account_manager_id" UUID,
    "default_channel_id" UUID,
    "notes" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "owner_type" "DeviceOwnerType" NOT NULL DEFAULT 'CLIENT',
    "client_id" UUID,
    "site_id" UUID,
    "device_class" "DeviceClass" NOT NULL,
    "management_mode" "DeviceManagementMode" NOT NULL DEFAULT 'AGENT',
    "gateway_device_id" UUID,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "platform" "Platform" NOT NULL,
    "arch" "CpuArch" NOT NULL,
    "os_name" TEXT,
    "os_version" TEXT,
    "agent_version" TEXT,
    "agent_protocol" INTEGER,
    "capabilities" TEXT[],
    "key_protection" TEXT,
    "machine_id" TEXT,
    "secure_boot_enabled" BOOLEAN,
    "firmware_secure_version" INTEGER,
    "last_request_seq" BIGINT NOT NULL DEFAULT 0,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(6),
    "last_ip" INET,
    "hardware" JSONB,
    "timezone" TEXT,
    "maintenance_window" JSONB,
    "auto_update" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_at" TIMESTAMPTZ(6),
    "enrollment_token_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_tokens" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "owner_type" "DeviceOwnerType" NOT NULL DEFAULT 'CLIENT',
    "client_id" UUID,
    "site_id" UUID,
    "project_ids" UUID[],
    "created_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_credentials" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'ES256',
    "public_key_jwk" JSONB NOT NULL,
    "thumbprint" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "hardware_backed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "device_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_installations" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "client_id" UUID,
    "client_project_id" UUID,
    "instance_name" TEXT,
    "current_release_id" UUID,
    "current_version" TEXT,
    "desired_release_id" UUID,
    "pinned_release_id" UUID,
    "status" "InstallationStatus" NOT NULL DEFAULT 'INSTALLING',
    "install_path" TEXT,
    "last_reported_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");

-- CreateTable
CREATE TABLE "device_commands" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "type" "CommandType" NOT NULL,
    "params" JSONB NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'QUEUED',
    "created_by_id" UUID NOT NULL,
    "approval_request_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tags" (
    "device_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "device_tags_pkey" PRIMARY KEY ("device_id","tag_id")
);

-- CreateTable
CREATE TABLE "release_channels" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "release_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "patch" INTEGER NOT NULL,
    "prerelease" TEXT,
    "version_code" INTEGER NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "security_fix" BOOLEAN NOT NULL DEFAULT false,
    "urgency" "ReleaseUrgency" NOT NULL DEFAULT 'NORMAL',
    "min_agent_version" TEXT,
    "upgrade_from" TEXT,
    "release_notes" JSONB NOT NULL,
    "tuf_role" TEXT,
    "tuf_role_version" INTEGER,
    "created_by_id" UUID NOT NULL,
    "published_by_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_artifacts" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "arch" "CpuArch" NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "file_id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "sha512" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "tuf_target_path" TEXT NOT NULL,
    "custom_meta" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_channel_entries" (
    "release_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "promoted_by_id" UUID NOT NULL,
    "promoted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_channel_entries_pkey" PRIMARY KEY ("release_id","channel_id")
);

-- CreateTable
CREATE TABLE "tuf_metadata" (
    "id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "json" JSONB NOT NULL,
    "sha256" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuf_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "strategy" "DeploymentStrategy" NOT NULL DEFAULT 'PHASED',
    "target_selector" JSONB NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "respect_maintenance" BOOLEAN NOT NULL DEFAULT true,
    "halt_min_failures" INTEGER NOT NULL DEFAULT 3,
    "halt_failure_rate_bp" INTEGER NOT NULL DEFAULT 200,
    "auto_rollback" BOOLEAN NOT NULL DEFAULT true,
    "allow_downgrade" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "approval_request_id" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_waves" (
    "id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "percent" INTEGER NOT NULL,
    "soak_minutes" INTEGER NOT NULL DEFAULT 1440,
    "status" "WaveStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "deployment_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_targets" (
    "id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "wave_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "installation_id" UUID,
    "from_version" TEXT,
    "to_release_id" UUID NOT NULL,
    "status" "TargetStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "last_agent_seq" BIGINT NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deployment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_target_events" (
    "id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target_id" UUID NOT NULL,
    "status" "TargetStatus" NOT NULL,
    "step" TEXT,
    "message" TEXT,
    "data" JSONB,
    "agent_time" TIMESTAMPTZ(6),
    "agent_seq" BIGINT,

    CONSTRAINT "deployment_target_events_pkey" PRIMARY KEY ("id","received_at")
) PARTITION BY RANGE ("received_at");

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "uploaded_by_type" "ActorType" NOT NULL,
    "uploaded_by_id" UUID,
    "folder_id" UUID,
    "previous_version_id" UUID,
    "retention_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "owner_type" "FolderOwnerType" NOT NULL,
    "owner_id" UUID,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "label" TEXT,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "s3_upload_id" TEXT NOT NULL,
    "part_size" INTEGER NOT NULL,
    "expected_size" BIGINT NOT NULL,
    "expected_sha256" TEXT,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "event_type" TEXT NOT NULL,
    "recipient_type" "RecipientType" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "dedupe_key" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "recipient_type" "RecipientType" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_identities" (
    "id" UUID NOT NULL,
    "recipient_type" "RecipientType" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "external_id" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "channel_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_link_tokens" (
    "token_hash" TEXT NOT NULL,
    "recipient_type" "RecipientType" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "channel_link_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "currency" "Currency",
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_jobs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "file_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "consumer" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer","event_id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("scope","key")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "is_service_account" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT,
    "password_changed_at" TIMESTAMPTZ(6),
    "mfa_required" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "realm" "AuthRealm" NOT NULL DEFAULT 'STAFF',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "condition" TEXT,
    "fields" TEXT[],

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" "ScopeType" NOT NULL DEFAULT 'GLOBAL',
    "scope_id" UUID,
    "granted_by_id" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "realm" "AuthRealm" NOT NULL,
    "user_id" UUID,
    "portal_user_id" UUID,
    "token_hash" TEXT NOT NULL,
    "mfa_verified_at" TIMESTAMPTZ(6),
    "step_up_at" TIMESTAMPTZ(6),
    "ip" INET,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TOTP',
    "secret_enc" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkeys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "name" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "prefix" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_users" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "contact_id" UUID,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "portal_role" "PortalRole" NOT NULL DEFAULT 'VIEWER',
    "email_verified_at" TIMESTAMPTZ(6),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_status_policy_key_idx" ON "approval_requests"("status", "policy_key");

-- CreateIndex
CREATE UNIQUE INDEX "approval_decisions_request_id_approver_id_key" ON "approval_decisions"("request_id", "approver_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_occurred_at_idx" ON "audit_logs"("resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_type_actor_id_occurred_at_idx" ON "audit_logs"("actor_type", "actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_occurred_at_idx" ON "audit_logs"("action", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_seq_idx" ON "audit_logs"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "audit_seals_from_seq_key" ON "audit_seals"("from_seq");

-- CreateIndex
CREATE UNIQUE INDEX "plans_project_id_code_key" ON "plans"("project_id", "code");

-- CreateIndex
CREATE INDEX "plan_prices_plan_id_currency_valid_from_idx" ON "plan_prices"("plan_id", "currency", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "plan_prices_id_currency_key" ON "plan_prices"("id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_code_key" ON "subscriptions"("code");

-- CreateIndex
CREATE INDEX "subscriptions_status_next_billing_on_idx" ON "subscriptions"("status", "next_billing_on");

-- CreateIndex
CREATE INDEX "subscriptions_client_id_idx" ON "subscriptions"("client_id");

-- CreateIndex
CREATE INDEX "subscriptions_client_project_id_idx" ON "subscriptions"("client_project_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_id_currency_key" ON "subscriptions"("id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_id_client_id_currency_key" ON "subscriptions"("id", "client_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_one_live_uq" ON "subscriptions"("client_project_id") WHERE (status <> 'CANCELLED' AND status <> 'EXPIRED');

-- CreateIndex
CREATE INDEX "subscription_revisions_subscription_id_valid_from_idx" ON "subscription_revisions"("subscription_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_revisions_subscription_id_revision_no_key" ON "subscription_revisions"("subscription_id", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_revisions_id_currency_key" ON "subscription_revisions"("id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_revisions_one_open_uq" ON "subscription_revisions"("subscription_id") WHERE (valid_to IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_revision_items_revision_id_plan_price_id_key" ON "subscription_revision_items"("revision_id", "plan_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "mrr_movements_revision_id_key" ON "mrr_movements"("revision_id");

-- CreateIndex
CREATE INDEX "mrr_movements_occurred_at_idx" ON "mrr_movements"("occurred_at");

-- CreateIndex
CREATE INDEX "mrr_movements_client_id_occurred_at_idx" ON "mrr_movements"("client_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_runs_run_date_key" ON "billing_runs"("run_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_client_id_status_due_date_idx" ON "invoices"("client_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_client_id_key" ON "invoices"("id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_client_id_currency_key" ON "invoices"("id", "client_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_one_recurring_per_period_uq" ON "invoices"("subscription_id", "period_start") WHERE (kind = 'RECURRING' AND status <> 'VOID');

-- CreateIndex
CREATE UNIQUE INDEX "invoices_one_proration_per_revision_uq" ON "invoices"("revision_id") WHERE (kind = 'PRORATION' AND status <> 'VOID');

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_position_key" ON "invoice_lines"("invoice_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes"("number");

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_code_key" ON "payments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_transaction_id_key" ON "payments"("gateway_transaction_id");

-- CreateIndex
CREATE INDEX "payments_client_id_status_idx" ON "payments"("client_id", "status");

-- CreateIndex
CREATE INDEX "payments_received_at_idx" ON "payments"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_client_id_currency_key" ON "payments"("id", "client_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "payments_manual_ref_uq" ON "payments"("method", "external_ref") WHERE (external_ref IS NOT NULL AND status <> 'REJECTED');

-- CreateIndex
CREATE UNIQUE INDEX "allocations_reversal_of_id_key" ON "allocations"("reversal_of_id");

-- CreateIndex
CREATE INDEX "allocations_invoice_id_idx" ON "allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "allocations_payment_id_idx" ON "allocations"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_gateway_transaction_id_key" ON "refunds"("gateway_transaction_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_number_key" ON "payment_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_id_kind_key" ON "payment_orders"("id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_id_client_id_key" ON "payment_orders"("id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_transactions_seq_key" ON "gateway_transactions"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_transactions_provider_external_id_key" ON "gateway_transactions"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_transactions_one_live_fixed_uq" ON "gateway_transactions"("payment_order_id") WHERE (order_kind = 'FIXED' AND (state = 'PENDING' OR state = 'SUCCEEDED'));

-- CreateIndex
CREATE INDEX "gateway_events_provider_external_id_idx" ON "gateway_events"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_source_base_quote_effective_date_key" ON "fx_rates"("source", "base", "quote", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_idempotency_key_key" ON "journal_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "journal_entries_source_type_source_id_idx" ON "journal_entries"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_entries_effective_date_idx" ON "journal_entries"("effective_date");

-- CreateIndex
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_code_client_id_currency_idx" ON "journal_lines"("account_code", "client_id", "currency");

-- CreateIndex
CREATE INDEX "mrr_snapshots_month_project_id_idx" ON "mrr_snapshots"("month", "project_id");

-- CreateIndex
CREATE INDEX "ar_aging_snapshots_as_of_client_id_idx" ON "ar_aging_snapshots"("as_of", "client_id");

-- CreateIndex
CREATE INDEX "expenses_spent_on_idx" ON "expenses"("spent_on");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE UNIQUE INDEX "clients_account_no_key" ON "clients"("account_no");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_account_manager_id_idx" ON "clients"("account_manager_id");

-- CreateIndex
CREATE INDEX "clients_search_trgm_idx" ON "clients" USING GIN ("legal_name" gin_trgm_ops, "display_name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "clients_tin_active_uq" ON "clients"("tin") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "clients_pinfl_active_uq" ON "clients"("pinfl_hash") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_contacts_one_primary_uq" ON "client_contacts"("client_id") WHERE (is_primary AND deleted_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "client_sites_id_client_id_key" ON "client_sites"("id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_sites_name_active_uq" ON "client_sites"("client_id", "name") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "client_notes_client_id_created_at_idx" ON "client_notes"("client_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_scope_name_key" ON "tags"("scope", "name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "project_components_project_id_key_key" ON "project_components"("project_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "project_components_id_project_id_key" ON "project_components"("id", "project_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "client_projects_project_id_status_idx" ON "client_projects"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "client_projects_client_id_project_id_key" ON "client_projects"("client_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_projects_id_client_id_key" ON "client_projects"("id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_projects_id_client_id_project_id_key" ON "client_projects"("id", "client_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_code_key" ON "devices"("code");

-- CreateIndex
CREATE INDEX "devices_client_id_status_idx" ON "devices"("client_id", "status");

-- CreateIndex
CREATE INDEX "devices_site_id_idx" ON "devices"("site_id");

-- CreateIndex
CREATE INDEX "devices_status_last_seen_at_idx" ON "devices"("status", "last_seen_at");

-- CreateIndex
CREATE INDEX "devices_device_class_idx" ON "devices"("device_class");

-- CreateIndex
CREATE INDEX "devices_gateway_device_id_idx" ON "devices"("gateway_device_id");

-- CreateIndex
CREATE INDEX "devices_machine_id_idx" ON "devices"("machine_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_tokens_token_hash_key" ON "enrollment_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "enrollment_tokens_client_id_idx" ON "enrollment_tokens"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_credentials_thumbprint_key" ON "device_credentials"("thumbprint");

-- CreateIndex
CREATE INDEX "device_credentials_device_id_idx" ON "device_credentials"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_credentials_one_active_uq" ON "device_credentials"("device_id") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "device_installations_component_id_current_release_id_idx" ON "device_installations"("component_id", "current_release_id");

-- CreateIndex
CREATE INDEX "device_installations_client_project_id_idx" ON "device_installations"("client_project_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_installations_id_component_id_device_id_key" ON "device_installations"("id", "component_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_installations_client_uq" ON "device_installations"("device_id", "component_id", "client_project_id") WHERE (client_project_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "device_installations_shared_uq" ON "device_installations"("device_id", "component_id") WHERE (client_project_id IS NULL);

-- CreateIndex
CREATE INDEX "device_events_device_id_occurred_at_idx" ON "device_events"("device_id", "occurred_at");

-- CreateIndex
CREATE INDEX "device_commands_device_id_status_idx" ON "device_commands"("device_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "release_channels_project_id_key_key" ON "release_channels"("project_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "release_channels_id_project_id_key" ON "release_channels"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_channels_one_default_uq" ON "release_channels"("project_id") WHERE (is_default);

-- CreateIndex
CREATE INDEX "releases_component_id_status_major_minor_patch_idx" ON "releases"("component_id", "status", "major", "minor", "patch");

-- CreateIndex
CREATE UNIQUE INDEX "releases_component_id_version_key" ON "releases"("component_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "releases_component_id_version_code_key" ON "releases"("component_id", "version_code");

-- CreateIndex
CREATE UNIQUE INDEX "releases_id_project_id_key" ON "releases"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "releases_id_component_id_key" ON "releases"("id", "component_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_artifacts_tuf_target_path_key" ON "release_artifacts"("tuf_target_path");

-- CreateIndex
CREATE UNIQUE INDEX "release_artifacts_release_id_platform_arch_kind_variant_key" ON "release_artifacts"("release_id", "platform", "arch", "kind", "variant");

-- CreateIndex
CREATE INDEX "tuf_metadata_role_expires_at_idx" ON "tuf_metadata"("role", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tuf_metadata_role_version_key" ON "tuf_metadata"("role", "version");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_code_key" ON "deployments"("code");

-- CreateIndex
CREATE INDEX "deployments_project_id_status_idx" ON "deployments"("project_id", "status");

-- CreateIndex
CREATE INDEX "deployments_component_id_status_idx" ON "deployments"("component_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_id_component_id_key" ON "deployments"("id", "component_id");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_waves_deployment_id_index_key" ON "deployment_waves"("deployment_id", "index");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_waves_id_deployment_id_key" ON "deployment_waves"("id", "deployment_id");

-- CreateIndex
CREATE INDEX "deployment_targets_device_id_status_idx" ON "deployment_targets"("device_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_targets_installation_uq" ON "deployment_targets"("deployment_id", "installation_id") WHERE (installation_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "deployment_targets_device_uq" ON "deployment_targets"("deployment_id", "device_id") WHERE (installation_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "deployment_targets_one_active_uq" ON "deployment_targets"("installation_id") WHERE (installation_id IS NOT NULL AND (status = 'PENDING' OR status = 'WAITING_WINDOW' OR status = 'DOWNLOADING' OR status = 'DOWNLOADED' OR status = 'INSTALLING' OR status = 'VERIFYING'));

-- CreateIndex
CREATE UNIQUE INDEX "deployment_targets_one_active_agent_uq" ON "deployment_targets"("device_id", "component_id") WHERE (installation_id IS NULL AND (status = 'PENDING' OR status = 'WAITING_WINDOW' OR status = 'DOWNLOADING' OR status = 'DOWNLOADED' OR status = 'INSTALLING' OR status = 'VERIFYING'));

-- CreateIndex
CREATE INDEX "deployment_target_events_target_id_received_at_idx" ON "deployment_target_events"("target_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "files_previous_version_id_key" ON "files"("previous_version_id");

-- CreateIndex
CREATE INDEX "files_sha256_idx" ON "files"("sha256");

-- CreateIndex
CREATE INDEX "files_folder_id_idx" ON "files"("folder_id");

-- CreateIndex
CREATE INDEX "folders_path_idx" ON "folders"("path");

-- CreateIndex
CREATE INDEX "folders_owner_type_owner_id_idx" ON "folders"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "folders_name_active_uq" ON "folders"("parent_id", "name") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "file_attachments_entity_type_entity_id_idx" ON "file_attachments"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_attachments_file_id_entity_type_entity_id_key" ON "file_attachments"("file_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_file_id_key" ON "upload_sessions"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_event_type_channel_locale_key" ON "notification_templates"("event_type", "channel", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_type_recipient_id_status_created_at_idx" ON "notifications"("recipient_type", "recipient_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_recipient_type_recipient_id_event__key" ON "notification_preferences"("recipient_type", "recipient_id", "event_type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "channel_identities_channel_external_id_key" ON "channel_identities"("channel", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_identities_recipient_type_recipient_id_channel_key" ON "channel_identities"("recipient_type", "recipient_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "metric_snapshots_date_metric_dimension_key" ON "metric_snapshots"("date", "metric", "dimension");

-- CreateIndex
CREATE INDEX "report_jobs_requested_by_id_created_at_idx" ON "report_jobs"("requested_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_user_id_resource_name_key" ON "saved_views"("user_id", "resource", "name");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_key_key" ON "outbox_events"("event_key");

-- CreateIndex
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events"("occurred_at") WHERE (published_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "user_role_assignments_user_id_idx" ON "user_role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_scope_type_scope_id_idx" ON "user_role_assignments"("scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_global_uq" ON "user_role_assignments"("user_id", "role_id") WHERE (scope_type = 'GLOBAL');

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_scoped_uq" ON "user_role_assignments"("user_id", "role_id", "scope_type", "scope_id") WHERE (scope_type <> 'GLOBAL');

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_portal_user_id_idx" ON "sessions"("portal_user_id");

-- CreateIndex
CREATE INDEX "mfa_factors_user_id_idx" ON "mfa_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "passkeys_credential_id_key" ON "passkeys"("credential_id");

-- CreateIndex
CREATE INDEX "passkeys_user_id_idx" ON "passkeys"("user_id");

-- CreateIndex
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_owner_id_idx" ON "api_keys"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_contact_id_key" ON "portal_users"("contact_id");

-- CreateIndex
CREATE INDEX "portal_users_client_id_idx" ON "portal_users"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_email_active_uq" ON "portal_users"("email") WHERE (status <> 'DEACTIVATED');

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_policy_key_fkey" FOREIGN KEY ("policy_key") REFERENCES "approval_policies"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_project_id_client_id_fkey" FOREIGN KEY ("client_project_id", "client_id") REFERENCES "client_projects"("id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_revisions" ADD CONSTRAINT "subscription_revisions_subscription_id_currency_fkey" FOREIGN KEY ("subscription_id", "currency") REFERENCES "subscriptions"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_revision_items" ADD CONSTRAINT "subscription_revision_items_revision_id_currency_fkey" FOREIGN KEY ("revision_id", "currency") REFERENCES "subscription_revisions"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_revision_items" ADD CONSTRAINT "subscription_revision_items_plan_price_id_currency_fkey" FOREIGN KEY ("plan_price_id", "currency") REFERENCES "plan_prices"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrr_movements" ADD CONSTRAINT "mrr_movements_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "subscription_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrr_movements" ADD CONSTRAINT "mrr_movements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrr_movements" ADD CONSTRAINT "mrr_movements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_client_id_currency_fkey" FOREIGN KEY ("subscription_id", "client_id", "currency") REFERENCES "subscriptions"("id", "client_id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_revision_id_currency_fkey" FOREIGN KEY ("revision_id", "currency") REFERENCES "subscription_revisions"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fx_rate_id_fkey" FOREIGN KEY ("fx_rate_id") REFERENCES "fx_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_void_approval_request_id_fkey" FOREIGN KEY ("void_approval_request_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_plan_price_id_fkey" FOREIGN KEY ("plan_price_id") REFERENCES "plan_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_client_id_currency_fkey" FOREIGN KEY ("invoice_id", "client_id", "currency") REFERENCES "invoices"("id", "client_id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_fx_rate_id_fkey" FOREIGN KEY ("fx_rate_id") REFERENCES "fx_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_gateway_transaction_id_fkey" FOREIGN KEY ("gateway_transaction_id") REFERENCES "gateway_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_payment_id_client_id_payment_currency_fkey" FOREIGN KEY ("payment_id", "client_id", "payment_currency") REFERENCES "payments"("id", "client_id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_invoice_id_client_id_invoice_currency_fkey" FOREIGN KEY ("invoice_id", "client_id", "invoice_currency") REFERENCES "invoices"("id", "client_id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_fx_rate_id_fkey" FOREIGN KEY ("fx_rate_id") REFERENCES "fx_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_gateway_transaction_id_fkey" FOREIGN KEY ("gateway_transaction_id") REFERENCES "gateway_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_fx_rate_id_fkey" FOREIGN KEY ("fx_rate_id") REFERENCES "fx_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_order_targets" ADD CONSTRAINT "payment_order_targets_order_id_client_id_fkey" FOREIGN KEY ("order_id", "client_id") REFERENCES "payment_orders"("id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_order_targets" ADD CONSTRAINT "payment_order_targets_invoice_id_client_id_fkey" FOREIGN KEY ("invoice_id", "client_id") REFERENCES "invoices"("id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_payment_order_id_order_kind_fkey" FOREIGN KEY ("payment_order_id", "order_kind") REFERENCES "payment_orders"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_code_fkey" FOREIGN KEY ("account_code") REFERENCES "ledger_accounts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrr_snapshots" ADD CONSTRAINT "mrr_snapshots_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_aging_snapshots" ADD CONSTRAINT "ar_aging_snapshots_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_sites" ADD CONSTRAINT "client_sites_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_default_channel_id_project_id_fkey" FOREIGN KEY ("default_channel_id", "project_id") REFERENCES "release_channels"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_site_id_client_id_fkey" FOREIGN KEY ("site_id", "client_id") REFERENCES "client_sites"("id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_gateway_device_id_fkey" FOREIGN KEY ("gateway_device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_enrollment_token_id_fkey" FOREIGN KEY ("enrollment_token_id") REFERENCES "enrollment_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_site_id_client_id_fkey" FOREIGN KEY ("site_id", "client_id") REFERENCES "client_sites"("id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_component_id_project_id_fkey" FOREIGN KEY ("component_id", "project_id") REFERENCES "project_components"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_client_project_id_client_id_project_i_fkey" FOREIGN KEY ("client_project_id", "client_id", "project_id") REFERENCES "client_projects"("id", "client_id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_current_release_id_component_id_fkey" FOREIGN KEY ("current_release_id", "component_id") REFERENCES "releases"("id", "component_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_desired_release_id_component_id_fkey" FOREIGN KEY ("desired_release_id", "component_id") REFERENCES "releases"("id", "component_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_pinned_release_id_component_id_fkey" FOREIGN KEY ("pinned_release_id", "component_id") REFERENCES "releases"("id", "component_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tags" ADD CONSTRAINT "device_tags_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tags" ADD CONSTRAINT "device_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_channels" ADD CONSTRAINT "release_channels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_component_id_project_id_fkey" FOREIGN KEY ("component_id", "project_id") REFERENCES "project_components"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_channel_entries" ADD CONSTRAINT "release_channel_entries_release_id_project_id_fkey" FOREIGN KEY ("release_id", "project_id") REFERENCES "releases"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_channel_entries" ADD CONSTRAINT "release_channel_entries_channel_id_project_id_fkey" FOREIGN KEY ("channel_id", "project_id") REFERENCES "release_channels"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_channel_entries" ADD CONSTRAINT "release_channel_entries_promoted_by_id_fkey" FOREIGN KEY ("promoted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuf_metadata" ADD CONSTRAINT "tuf_metadata_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_component_id_project_id_fkey" FOREIGN KEY ("component_id", "project_id") REFERENCES "project_components"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_release_id_component_id_fkey" FOREIGN KEY ("release_id", "component_id") REFERENCES "releases"("id", "component_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_waves" ADD CONSTRAINT "deployment_waves_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_deployment_id_component_id_fkey" FOREIGN KEY ("deployment_id", "component_id") REFERENCES "deployments"("id", "component_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_wave_id_deployment_id_fkey" FOREIGN KEY ("wave_id", "deployment_id") REFERENCES "deployment_waves"("id", "deployment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_installation_id_component_id_device_id_fkey" FOREIGN KEY ("installation_id", "component_id", "device_id") REFERENCES "device_installations"("id", "component_id", "device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_to_release_id_component_id_fkey" FOREIGN KEY ("to_release_id", "component_id") REFERENCES "releases"("id", "component_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_target_events" ADD CONSTRAINT "deployment_target_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "client_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- ADS-ERP — integrity.sql
-- Prisma schema ifoda qila olmaydigan ma'lumotlar yaxlitligi qoidalari:
-- CHECK, EXCLUDE, trigger'lar, davr qulfi, partitioning, huquqlar va RLS.
--
-- Qo'llash tartibi (P0): `prisma migrate dev --create-only` bilan yaratilgan
-- birinchi migratsiya SQL'iga qo'shiladi:
--   1) 0-bo'lim (extension'lar) — Prisma DDL'dan OLDIN (GIN trigram index uchun);
--   2) Prisma DDL (4 ta jadval PARTITION BY RANGE ga o'tkaziladi — 10-bo'lim);
--   3) qolgan bo'limlar — DDL'dan KEYIN.
-- Ustunlar snake_case (Prisma @map), enum tiplari "PascalCase".
-- Barcha xatolar SQLSTATE 23000 (integrity_constraint_violation) yoki 23xxx.
-- Har bir qoida constraint test suite bilan qoplangan (docs/architecture/database/integrity-tests.md).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. Extension'lar ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- EXCLUDE: uuid/enum tengligi + range kesishmasi
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- global qidiruv (clients_search_trgm_idx)

-- ── 1. Umumiy funksiyalar ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ads_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on % is forbidden', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

-- Luhn nazorat raqami (accountNo, PaymentOrder.number) — ilovadagi xato terilgan raqamni ushlaydi
CREATE OR REPLACE FUNCTION ads_luhn_ok(digits text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT digits ~ '^[0-9]+$' AND (
    SELECT sum(CASE WHEN (length(digits) - i) % 2 = 1
                    THEN CASE WHEN d * 2 > 9 THEN d * 2 - 9 ELSE d * 2 END
                    ELSE d END) % 10 = 0
    FROM (SELECT i, substr(digits, i, 1)::int AS d FROM generate_series(1, length(digits)) AS i) s)
$$;

-- Append-only jadvallar (UPDATE/DELETE taqiqlangan; tuzatish — yangi yozuv/reversal)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'allocations','credit_notes','journal_entries','journal_lines','gateway_events','mrr_movements',
    'mrr_snapshots','ar_aging_snapshots','subscription_revision_items','payment_order_targets',
    'audit_logs','audit_seals','device_events','deployment_target_events','tuf_metadata','approval_decisions'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ads_forbid_mutation()',
                   t || '_append_only', t);
  END LOOP;
END $$;

-- ── 2. IAM ───────────────────────────────────────────────────────────────────
ALTER TABLE users        ADD CONSTRAINT users_email_lower_ck        CHECK (email = lower(email));
ALTER TABLE portal_users ADD CONSTRAINT portal_users_email_lower_ck CHECK (email = lower(email));
ALTER TABLE user_role_assignments ADD CONSTRAINT user_role_assignments_scope_ck
  CHECK ((scope_type = 'GLOBAL') = (scope_id IS NULL));
ALTER TABLE sessions ADD CONSTRAINT sessions_realm_ck CHECK (
      ((realm = 'STAFF'  AND user_id IS NOT NULL AND portal_user_id IS NULL)
    OR (realm = 'PORTAL' AND portal_user_id IS NOT NULL AND user_id IS NULL))
  AND idle_expires_at <= absolute_expires_at);
-- System rollari o'zgartirilmaydi/o'chirilmaydi (seed — app_migrator orqali, trigger vaqtincha o'chiriladi)
CREATE TRIGGER roles_system_guard BEFORE UPDATE OR DELETE ON roles
  FOR EACH ROW WHEN (OLD.is_system) EXECUTE FUNCTION ads_forbid_mutation();

-- Tasdiqlovchi ruxsati: GLOBAL scope'dagi faol rol orqali (masalan, "Rahbar" roli → payments:approve)
CREATE OR REPLACE FUNCTION ads_user_has_permission(p_user uuid, p_permission text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_role_assignments ura
      JOIN role_permissions rp ON rp.role_id = ura.role_id
      JOIN users u ON u.id = ura.user_id
     WHERE ura.user_id = p_user AND rp.permission_key = p_permission AND ura.scope_type = 'GLOBAL'
       AND (ura.expires_at IS NULL OR ura.expires_at > now()) AND u.status = 'ACTIVE')
$$;

-- ── 3. Approvals (maker-checker) ─────────────────────────────────────────────
ALTER TABLE approval_policies ADD CONSTRAINT approval_policies_ck CHECK (required_approvals >= 1);
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_ck
  CHECK (required_approvals >= 1 AND expires_at > created_at);

CREATE OR REPLACE FUNCTION ads_approval_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM approval_requests r JOIN approval_policies p ON p.key = r.policy_key
              WHERE r.id = NEW.request_id AND r.requested_by_id = NEW.approver_id AND NOT p.allow_self_approval) THEN
    RAISE EXCEPTION 'separation of duties: requester cannot decide own request %', NEW.request_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approval_requests r
                  WHERE r.id = NEW.request_id AND r.status = 'PENDING' AND r.expires_at > now()) THEN
    RAISE EXCEPTION 'approval request % is not pending', NEW.request_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Tasdiqlovchida siyosat talab qiladigan ruxsat bo'lishi shart (rahbar yoki rahbar ruxsat bergan menejer)
  IF NOT EXISTS (SELECT 1 FROM approval_requests r JOIN approval_policies p ON p.key = r.policy_key
                  WHERE r.id = NEW.request_id AND ads_user_has_permission(NEW.approver_id, p.approver_permission)) THEN
    RAISE EXCEPTION 'user % lacks the approver permission for request %', NEW.approver_id, NEW.request_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_decisions_guard BEFORE INSERT ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION ads_approval_decision_guard();

-- ── 4. CRM va Projects ───────────────────────────────────────────────────────
ALTER TABLE clients ADD CONSTRAINT clients_ck CHECK (
      account_no ~ '^[0-9]{8}$' AND ads_luhn_ok(account_no)
  AND (tin IS NULL OR tin ~ '^[0-9]{9}$')
  AND (bank_mfo IS NULL OR bank_mfo ~ '^[0-9]{5}$')
  AND (bank_account IS NULL OR bank_account ~ '^[0-9]{20}$')
  AND ((pinfl_enc IS NULL) = (pinfl_hash IS NULL)));
ALTER TABLE client_projects ADD CONSTRAINT client_projects_dates_ck
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on);

-- ── 5. Devices ───────────────────────────────────────────────────────────────
ALTER TABLE enrollment_tokens ADD CONSTRAINT enrollment_tokens_ck CHECK (
      max_uses >= 1 AND used_count BETWEEN 0 AND max_uses
  AND expires_at > created_at AND expires_at <= created_at + interval '72 hours'
  AND ((owner_type = 'CLIENT') = (client_id IS NOT NULL))
  AND (owner_type = 'CLIENT' OR site_id IS NULL));
ALTER TABLE devices ADD CONSTRAINT devices_ck CHECK (
      ((status IN ('REVOKED','DECOMMISSIONED')) = (revoked_at IS NOT NULL)) AND last_request_seq >= 0
  AND ((owner_type = 'CLIENT') = (client_id IS NOT NULL))          -- kompaniya qurilmasi mijozga bog'lanmaydi
  AND (owner_type = 'CLIENT' OR site_id IS NULL)
  AND ((device_class = 'MICROCONTROLLER') = (platform = 'ESP_IDF'))
  AND ((platform = 'ESP_IDF') = (management_mode <> 'AGENT'))      -- ESP32'da Go agent yo'q, boshqalarda — bor
  AND ((management_mode = 'GATEWAY_PROXIED') = (gateway_device_id IS NOT NULL))
  AND (gateway_device_id IS NULL OR gateway_device_id <> id));

-- Gateway-qurilma AGENT rejimida va (ikkalasi mijozniki bo'lsa) o'sha mijozniki bo'lishi shart;
-- faol o'rnatmalari bor qurilmaning egasini o'zgartirib bo'lmaydi
CREATE OR REPLACE FUNCTION ads_device_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g record;
BEGIN
  IF NEW.gateway_device_id IS NOT NULL THEN
    SELECT management_mode, owner_type, client_id INTO g FROM devices WHERE id = NEW.gateway_device_id;
    IF g.management_mode <> 'AGENT'
       OR (NEW.owner_type = 'CLIENT' AND g.owner_type = 'CLIENT' AND g.client_id IS DISTINCT FROM NEW.client_id) THEN
      RAISE EXCEPTION 'gateway device % must be an AGENT device of the same client', NEW.gateway_device_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.owner_type, NEW.client_id) IS DISTINCT FROM (OLD.owner_type, OLD.client_id)
     AND EXISTS (SELECT 1 FROM device_installations WHERE device_id = OLD.id AND status <> 'UNINSTALLED') THEN
    RAISE EXCEPTION 'device % has active installations; ownership cannot change', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER devices_guard BEFORE INSERT OR UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION ads_device_guard();

ALTER TABLE device_installations ADD CONSTRAINT device_installations_ck
  CHECK ((client_project_id IS NULL) = (client_id IS NULL));

-- O'rnatma qurilma egasiga va platformasiga mos: umumiy (mijozsiz) instans faqat COMPANY qurilmada;
-- mijoz qurilmasida faqat o'sha mijozning instansi; FIRMWARE komponent faqat ESP32'da
CREATE OR REPLACE FUNCTION ads_installation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; rt text;
BEGIN
  SELECT owner_type, client_id, platform INTO d FROM devices WHERE id = NEW.device_id;
  IF NEW.client_id IS NULL AND d.owner_type <> 'COMPANY' THEN
    RAISE EXCEPTION 'shared (client-less) installation is allowed only on COMPANY devices'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF d.owner_type = 'CLIENT' AND NEW.client_id IS DISTINCT FROM d.client_id THEN
    RAISE EXCEPTION 'installation client must match the owner of device %', NEW.device_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT runtime::text INTO rt FROM project_components WHERE id = NEW.component_id;
  IF (rt = 'FIRMWARE') <> (d.platform = 'ESP_IDF') THEN
    RAISE EXCEPTION 'component runtime % is incompatible with device platform %', rt, d.platform
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER device_installations_guard BEFORE INSERT OR UPDATE ON device_installations
  FOR EACH ROW EXECUTE FUNCTION ads_installation_guard();
ALTER TABLE device_credentials ADD CONSTRAINT device_credentials_ck CHECK (
      algorithm = 'ES256' AND ((status = 'REVOKED') = (revoked_at IS NOT NULL)));
ALTER TABLE device_commands ADD CONSTRAINT device_commands_ck CHECK (expires_at > created_at);

-- ── 6. Releases (TUF) ────────────────────────────────────────────────────────
ALTER TABLE releases ADD CONSTRAINT releases_ck CHECK (
      version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
  AND major >= 0 AND minor >= 0 AND patch >= 0 AND version_code > 0
  AND (status NOT IN ('READY','PUBLISHED','DEPRECATED','REVOKED') OR tuf_role_version IS NOT NULL)
  AND ((status = 'REVOKED') = (revoked_at IS NOT NULL))
  AND (published_by_id IS NULL OR published_by_id <> created_by_id));          -- SoD
ALTER TABLE release_artifacts ADD CONSTRAINT release_artifacts_ck CHECK (
      sha256 ~ '^[0-9a-f]{64}$' AND sha512 ~ '^[0-9a-f]{128}$' AND size_bytes > 0);
ALTER TABLE tuf_metadata ADD CONSTRAINT tuf_metadata_ck CHECK (version >= 1 AND sha256 ~ '^[0-9a-f]{64}$');

-- Imzolangan (READY+) relizning yadrosi va artefaktlari o'zgarmaydi
CREATE OR REPLACE FUNCTION ads_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mutable text[] := ARRAY['status','published_by_id','published_at','revoked_at','revoke_reason',
                                'release_notes','row_version','updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('DRAFT','UPLOADING','SCANNING','AWAITING_SIGNATURES') THEN
      RAISE EXCEPTION 'signed release % cannot be deleted', OLD.id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('READY','PUBLISHED','DEPRECATED','REVOKED')
     AND (to_jsonb(NEW) - mutable) <> (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'release % is signed; its core fields are immutable', OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'REVOKED' AND NEW.status <> 'REVOKED' THEN
    RAISE EXCEPTION 'revoked release % cannot be restored', OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER releases_guard BEFORE UPDATE OR DELETE ON releases FOR EACH ROW EXECUTE FUNCTION ads_release_guard();

CREATE OR REPLACE FUNCTION ads_release_artifact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rel uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN rel := OLD.release_id; ELSE rel := NEW.release_id; END IF;
  IF EXISTS (SELECT 1 FROM releases r WHERE r.id = rel
              AND r.status NOT IN ('DRAFT','UPLOADING','SCANNING','AWAITING_SIGNATURES')) THEN
    RAISE EXCEPTION 'artifacts of signed release % are immutable', rel USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER release_artifacts_guard BEFORE INSERT OR UPDATE OR DELETE ON release_artifacts
  FOR EACH ROW EXECUTE FUNCTION ads_release_artifact_guard();

-- ── 7. Deployments ───────────────────────────────────────────────────────────
ALTER TABLE deployments ADD CONSTRAINT deployments_ck CHECK (
      halt_min_failures >= 1 AND halt_failure_rate_bp BETWEEN 0 AND 10000);
ALTER TABLE deployment_waves ADD CONSTRAINT deployment_waves_ck CHECK (
      index >= 0 AND percent BETWEEN 0 AND 100 AND soak_minutes >= 0);
ALTER TABLE deployment_targets ADD CONSTRAINT deployment_targets_ck CHECK (attempt >= 0 AND last_agent_seq >= 0);

-- Faqat imzolangan (READY/PUBLISHED) reliz rejalashtiriladi/ishga tushiriladi
CREATE OR REPLACE FUNCTION ads_deployment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('SCHEDULED','RUNNING') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS (SELECT 1 FROM releases r WHERE r.id = NEW.release_id AND r.status IN ('READY','PUBLISHED')) THEN
      RAISE EXCEPTION 'deployment % requires a signed (READY/PUBLISHED) release', NEW.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deployments_guard BEFORE INSERT OR UPDATE ON deployments FOR EACH ROW EXECUTE FUNCTION ads_deployment_guard();

-- ── 8. Billing: tariflar va obunalar ─────────────────────────────────────────
ALTER TABLE plan_prices
  ADD CONSTRAINT plan_prices_ck CHECK (unit_amount_minor >= 0 AND vat_rate_bp BETWEEN 0 AND 10000
                                       AND (valid_to IS NULL OR valid_to > valid_from)),
  ADD CONSTRAINT plan_prices_no_overlap EXCLUDE USING gist
      (plan_id WITH =, currency WITH =, daterange(valid_from, valid_to, '[)') WITH &&);

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_ck CHECK (
      (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start)
  AND (status <> 'TRIALING' OR trial_ends_on IS NOT NULL)
  AND ((status IN ('CANCELLED','EXPIRED')) = (ended_at IS NOT NULL))
  AND ((status IN ('PAST_DUE','SUSPENDED')) = (past_due_since IS NOT NULL))
  AND payment_terms_days BETWEEN 0 AND 90 AND grace_days BETWEEN 0 AND 90);

CREATE OR REPLACE FUNCTION ads_subscription_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'subscriptions are never deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.client_id, NEW.client_project_id, NEW.currency) IS DISTINCT FROM (OLD.client_id, OLD.client_project_id, OLD.currency) THEN
    RAISE EXCEPTION 'subscription % identity (client, client_project, currency) is immutable', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status <> OLD.status AND (OLD.status::text, NEW.status::text) NOT IN (
      ('TRIALING','ACTIVE'),('TRIALING','EXPIRED'),('TRIALING','CANCELLED'),
      ('ACTIVE','PAST_DUE'),('ACTIVE','CANCELLED'),('ACTIVE','EXPIRED'),
      ('PAST_DUE','ACTIVE'),('PAST_DUE','SUSPENDED'),('PAST_DUE','CANCELLED'),
      ('SUSPENDED','ACTIVE'),('SUSPENDED','CANCELLED')) THEN
    RAISE EXCEPTION 'illegal subscription transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscriptions_guard BEFORE UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION ads_subscription_guard();

ALTER TABLE subscription_revisions
  ADD CONSTRAINT subscription_revisions_ck CHECK (mrr_minor >= 0 AND revision_no >= 1
                                                  AND (valid_to IS NULL OR valid_to > valid_from)),
  ADD CONSTRAINT subscription_revisions_no_overlap EXCLUDE USING gist
      (subscription_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&);

CREATE OR REPLACE FUNCTION ads_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'subscription revisions are never deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.valid_to IS NOT NULL OR NEW.valid_to IS NULL
     OR (to_jsonb(NEW) - 'valid_to') <> (to_jsonb(OLD) - 'valid_to') THEN
    RAISE EXCEPTION 'revision %: only closing valid_to once is allowed', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscription_revisions_guard BEFORE UPDATE OR DELETE ON subscription_revisions
  FOR EACH ROW EXECUTE FUNCTION ads_revision_guard();

ALTER TABLE subscription_revision_items ADD CONSTRAINT subscription_revision_items_ck CHECK (
      quantity > 0 AND unit_amount_minor >= 0 AND discount_bp BETWEEN 0 AND 10000);
ALTER TABLE mrr_movements ADD CONSTRAINT mrr_movements_ck CHECK (delta_minor <> 0);

-- ── 9. Billing: invoice'lar ──────────────────────────────────────────────────
ALTER TABLE invoices
  ADD CONSTRAINT invoices_amounts_ck CHECK (
        total_minor = subtotal_minor + vat_minor AND total_minor >= 0
    AND paid_minor >= 0 AND credited_minor >= 0 AND paid_minor + credited_minor <= total_minor),
  ADD CONSTRAINT invoices_state_ck CHECK (
        ((status = 'DRAFT') = (number IS NULL AND finalized_at IS NULL))
    AND ((status = 'VOID')  = (voided_at IS NOT NULL))
    AND (status <> 'VOID' OR (paid_minor = 0 AND void_reason IS NOT NULL))
    AND (status IN ('DRAFT','VOID') OR ((status = 'PAID') = (paid_minor + credited_minor = total_minor)))),
  ADD CONSTRAINT invoices_final_ck CHECK (status = 'DRAFT' OR (
        issue_date IS NOT NULL AND due_date >= issue_date AND total_uzs_minor IS NOT NULL
    AND ((currency = 'UZS') = (fx_rate IS NULL))
    AND (currency <> 'UZS' OR total_uzs_minor = total_minor)
    AND (currency =  'UZS' OR total_uzs_minor = round(total_minor * fx_rate)))),
  ADD CONSTRAINT invoices_kind_ck CHECK (
        (kind <> 'RECURRING' OR (subscription_id IS NOT NULL AND period_start IS NOT NULL AND period_end > period_start))
    AND (kind <> 'PRORATION' OR (subscription_id IS NOT NULL AND revision_id IS NOT NULL)));

CREATE OR REPLACE FUNCTION ads_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s numeric; v numeric;
        mutable text[] := ARRAY['paid_minor','credited_minor','status','voided_at','void_reason',
                                'void_approval_request_id','pdf_file_id','overdue_notified_at','row_version','updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'finalized invoice % cannot be deleted', OLD.id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' THEN                           -- finalizatsiya
    SELECT coalesce(sum(amount_minor), 0), coalesce(sum(vat_minor), 0) INTO s, v
      FROM invoice_lines WHERE invoice_id = NEW.id;
    IF s <> NEW.subtotal_minor OR v <> NEW.vat_minor THEN
      RAISE EXCEPTION 'invoice % totals do not match its lines', NEW.id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF OLD.status <> 'DRAFT' THEN
    IF (to_jsonb(NEW) - mutable) <> (to_jsonb(OLD) - mutable)
       OR NEW.status = 'DRAFT' OR (OLD.status = 'VOID' AND NEW.status <> 'VOID')
       OR (OLD.pdf_file_id IS NOT NULL AND NEW.pdf_file_id IS DISTINCT FROM OLD.pdf_file_id) THEN
      RAISE EXCEPTION 'invoice % is finalized; use a credit note', OLD.id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_guard BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION ads_invoice_guard();

ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_math_ck CHECK (
      quantity > 0 AND proration_den > 0 AND proration_num BETWEEN 0 AND proration_den
  AND vat_rate_bp BETWEEN 0 AND 10000
  AND amount_minor = round(quantity::numeric * unit_amount_minor * proration_num / proration_den)
  AND vat_minor    = round(amount_minor::numeric * vat_rate_bp / 10000)
  AND (amount_minor >= 0 OR type = 'DISCOUNT'));

CREATE OR REPLACE FUNCTION ads_invoice_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN inv := OLD.invoice_id; ELSE inv := NEW.invoice_id; END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id <> OLD.invoice_id THEN
    RAISE EXCEPTION 'invoice lines cannot move between invoices' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM invoices WHERE id = inv) THEN
    RETURN OLD;                                                                    -- DRAFT invoice cascade
  END IF;
  PERFORM 1 FROM invoices WHERE id = inv AND status = 'DRAFT' FOR SHARE;           -- finalizatsiya bilan ketma-ket
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lines of invoice % are frozen', inv USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION ads_invoice_line_guard();

ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_ck CHECK (
      amount_minor > 0 AND vat_minor BETWEEN 0 AND amount_minor);

CREATE OR REPLACE FUNCTION ads_credit_note_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ads_user_has_permission(NEW.approved_by_id, 'credit_notes:approve') THEN
    RAISE EXCEPTION 'user % lacks credit_notes:approve', NEW.approved_by_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE invoices SET credited_minor = credited_minor + NEW.amount_minor,
         status = CASE WHEN paid_minor + credited_minor + NEW.amount_minor = total_minor
                       THEN 'PAID'::"InvoiceStatus" ELSE status END
   WHERE id = NEW.invoice_id AND status IN ('OPEN','PAID','UNCOLLECTIBLE');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice % cannot be credited', NEW.invoice_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;   -- invoices_amounts_ck: to'langan invoice'ni kreditlashdan oldin allocation reversal kerak
END $$;
CREATE TRIGGER credit_notes_apply AFTER INSERT ON credit_notes FOR EACH ROW EXECUTE FUNCTION ads_credit_note_apply();

-- ── 10. Billing: to'lovlar, taqsimlash, refund ───────────────────────────────
ALTER TABLE payments
  ADD CONSTRAINT payments_amounts_ck CHECK (
        amount_minor > 0 AND allocated_minor >= 0 AND refunded_minor >= 0
    AND allocated_minor + refunded_minor <= amount_minor AND fx_rate > 0               -- ortiqcha taqsimlash imkonsiz
    AND (currency <> 'UZS' OR (fx_rate = 1 AND amount_uzs_minor = amount_minor))
    AND (currency =  'UZS' OR amount_uzs_minor = round(amount_minor * fx_rate))),
  ADD CONSTRAINT payments_channel_ck CHECK (
        ((method IN ('PAYME','CLICK','UZUM')) = (gateway_transaction_id IS NOT NULL))
    AND (gateway_transaction_id IS NULL OR (currency = 'UZS' AND status = 'POSTED'))
    AND (status <> 'POSTED' OR gateway_transaction_id IS NOT NULL                       -- qo'lda to'lov: tasdiqlovchi majburiy
         OR (created_by_id IS NOT NULL AND approved_by_id IS NOT NULL)));

-- Qo'lda to'lovni faqat `payments:approve` ruxsati bor xodim (rahbar) POSTED qiladi.
-- Rahbar o'zi kiritgan to'lovni o'zi tasdiqlashi mumkin; ruxsatsiz xodim — hech qachon.
CREATE OR REPLACE FUNCTION ads_payment_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'POSTED' AND NEW.gateway_transaction_id IS NULL AND NEW.approved_by_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'POSTED')
     AND NOT ads_user_has_permission(NEW.approved_by_id, 'payments:approve') THEN
    RAISE EXCEPTION 'user % lacks payments:approve', NEW.approved_by_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_approval_guard BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION ads_payment_approval_guard();

CREATE OR REPLACE FUNCTION ads_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mutable text[] := ARRAY['allocated_minor','refunded_minor','status','approved_by_id','receipt_file_id','notes'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are never deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (to_jsonb(NEW) - mutable) <> (to_jsonb(OLD) - mutable)
     OR (NEW.status <> OLD.status AND NOT (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('POSTED','REJECTED')))
     OR (OLD.status <> 'PENDING_APPROVAL' AND NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id) THEN
    RAISE EXCEPTION 'illegal mutation of payment %', OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION ads_payment_guard();

ALTER TABLE allocations ADD CONSTRAINT allocations_ck CHECK (
      amount_payment_minor <> 0
  AND sign(amount_payment_minor) = sign(amount_invoice_minor)
  AND sign(carrying_uzs_minor)   = sign(amount_payment_minor)
  AND ((reversal_of_id IS NULL) = (amount_payment_minor > 0))
  AND fx_diff_uzs_minor = settled_uzs_minor - carrying_uzs_minor
  AND fx_rate > 0
  AND CASE
        WHEN payment_currency = invoice_currency THEN
             amount_payment_minor = amount_invoice_minor AND fx_rate = 1
             AND (payment_currency <> 'UZS' OR (fx_diff_uzs_minor = 0 AND settled_uzs_minor = amount_payment_minor))
        WHEN payment_currency = 'UZS' THEN                 -- UZS pul → USD invoice; ≤ 1 so'm yaxlitlash tolerantligi
             abs(amount_payment_minor - round(amount_invoice_minor * fx_rate)) <= 100
             AND settled_uzs_minor = amount_payment_minor
        ELSE                                               -- USD pul → UZS invoice
             abs(amount_invoice_minor - round(amount_payment_minor * fx_rate)) <= 100
             AND carrying_uzs_minor = amount_invoice_minor
      END);

CREATE OR REPLACE FUNCTION ads_allocation_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reversal_of_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM allocations o
        WHERE o.id = NEW.reversal_of_id AND o.reversal_of_id IS NULL
          AND o.payment_id = NEW.payment_id AND o.invoice_id = NEW.invoice_id
          AND o.amount_payment_minor = -NEW.amount_payment_minor AND o.amount_invoice_minor = -NEW.amount_invoice_minor
          AND o.settled_uzs_minor = -NEW.settled_uzs_minor AND o.carrying_uzs_minor = -NEW.carrying_uzs_minor) THEN
    RAISE EXCEPTION 'a reversal must exactly negate its original allocation' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  UPDATE payments SET allocated_minor = allocated_minor + NEW.amount_payment_minor     -- lock tartibi: payment → invoice
   WHERE id = NEW.payment_id AND status = 'POSTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % is not POSTED', NEW.payment_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  UPDATE invoices SET paid_minor = paid_minor + NEW.amount_invoice_minor,
         status = CASE WHEN paid_minor + NEW.amount_invoice_minor + credited_minor = total_minor THEN 'PAID'::"InvoiceStatus"
                       WHEN status = 'PAID' THEN 'OPEN'::"InvoiceStatus" ELSE status END
   WHERE id = NEW.invoice_id AND status IN ('OPEN','PAID','UNCOLLECTIBLE');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice % is not allocatable', NEW.invoice_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER allocations_apply AFTER INSERT ON allocations FOR EACH ROW EXECUTE FUNCTION ads_allocation_apply();

ALTER TABLE refunds ADD CONSTRAINT refunds_ck CHECK (
      amount_minor > 0
  AND ((status = 'SUCCEEDED') = (completed_at IS NOT NULL))
  AND (status NOT IN ('APPROVED','SUCCEEDED') OR approved_by_id IS NOT NULL));

CREATE OR REPLACE FUNCTION ads_refund_apply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta bigint := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'REQUESTED' THEN
      RAISE EXCEPTION 'refunds start as REQUESTED' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    delta := NEW.amount_minor;                                                        -- mablag' darhol band qilinadi
  ELSE
    IF (NEW.payment_id, NEW.amount_minor) IS DISTINCT FROM (OLD.payment_id, OLD.amount_minor)
       OR (NEW.status <> OLD.status AND (OLD.status::text, NEW.status::text) NOT IN
           (('REQUESTED','APPROVED'),('REQUESTED','FAILED'),('APPROVED','SUCCEEDED'),('APPROVED','FAILED'))) THEN
      RAISE EXCEPTION 'illegal refund change %', OLD.id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status = 'APPROVED' AND OLD.status <> 'APPROVED'
       AND NOT ads_user_has_permission(NEW.approved_by_id, 'refunds:approve') THEN
      RAISE EXCEPTION 'user % lacks refunds:approve', NEW.approved_by_id USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status = 'FAILED' AND OLD.status <> 'FAILED' THEN delta := -OLD.amount_minor; END IF;
  END IF;
  IF delta <> 0 THEN
    UPDATE payments SET refunded_minor = refunded_minor + delta WHERE id = NEW.payment_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER refunds_apply AFTER INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION ads_refund_apply();
CREATE TRIGGER refunds_no_delete BEFORE DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION ads_forbid_mutation();

-- ── 11. Gateways ─────────────────────────────────────────────────────────────
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_ck CHECK (
      ((kind = 'FIXED') = (amount_minor IS NOT NULL))
  AND (amount_minor IS NULL OR amount_minor > 0)
  AND number ~ '^[0-9]{10,12}$' AND ads_luhn_ok(number)
  AND (fx_rate IS NULL OR fx_rate > 0));
ALTER TABLE payment_order_targets ADD CONSTRAINT payment_order_targets_ck CHECK (
      amount_invoice_minor > 0 AND amount_uzs_minor > 0);
ALTER TABLE gateway_transactions ADD CONSTRAINT gateway_transactions_ck CHECK (
      amount_minor > 0
  AND ((state IN ('SUCCEEDED','REFUNDED')) = (performed_at IS NOT NULL))
  AND ((state IN ('CANCELLED','REFUNDED')) = (cancelled_at IS NOT NULL)));

CREATE OR REPLACE FUNCTION ads_gateway_tx_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mutable text[] := ARRAY['state','performed_at','cancelled_at','cancel_reason','fiscal_data'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'gateway transactions are never deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (to_jsonb(NEW) - mutable) <> (to_jsonb(OLD) - mutable)
     OR (NEW.state <> OLD.state AND (OLD.state::text, NEW.state::text) NOT IN
         (('PENDING','SUCCEEDED'),('PENDING','CANCELLED'),('SUCCEEDED','REFUNDED')))
     OR (OLD.performed_at IS NOT NULL AND NEW.performed_at IS DISTINCT FROM OLD.performed_at)
     OR (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'illegal gateway transaction change %', OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gateway_transactions_guard BEFORE UPDATE OR DELETE ON gateway_transactions
  FOR EACH ROW EXECUTE FUNCTION ads_gateway_tx_guard();

-- ── 12. Finance: kurslar, ledger, davr qulfi ─────────────────────────────────
ALTER TABLE fx_rates ADD CONSTRAINT fx_rates_ck CHECK (
      rate > 0 AND base <> quote AND ((source = 'CBU') = (created_by_id IS NULL)));
CREATE TRIGGER fx_rates_no_update BEFORE UPDATE ON fx_rates FOR EACH ROW EXECUTE FUNCTION ads_forbid_mutation();
-- MANUAL kursni faqat hech bir hujjat ishlatmagan bo'lsa o'chirish mumkin (FK Restrict himoya qiladi); CBU — hech qachon
CREATE TRIGGER fx_rates_cbu_no_delete BEFORE DELETE ON fx_rates
  FOR EACH ROW WHEN (OLD.source = 'CBU') EXECUTE FUNCTION ads_forbid_mutation();

ALTER TABLE financial_periods ADD CONSTRAINT financial_periods_ck CHECK (
      month = date_trunc('month', month)::date
  AND (closed_at IS NULL OR (fx_revalued_at IS NOT NULL AND fx_revalued_at <= closed_at)));

ALTER TABLE document_sequences ADD CONSTRAINT document_sequences_ck CHECK (next_value >= 1 AND year BETWEEN 2000 AND 2100);
ALTER TABLE expenses ADD CONSTRAINT expenses_ck CHECK (
      amount_minor > 0 AND fx_rate > 0
  AND (currency <> 'UZS' OR (fx_rate = 1 AND amount_uzs_minor = amount_minor))
  AND (currency =  'UZS' OR amount_uzs_minor = round(amount_minor * fx_rate)));

ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_ck CHECK (
      (amount_minor <> 0 OR amount_uzs_minor <> 0)
  AND sign(amount_minor) * sign(amount_uzs_minor) >= 0
  AND (currency <> 'UZS' OR amount_minor = amount_uzs_minor));

CREATE OR REPLACE FUNCTION ads_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT coalesce(sum(amount_uzs_minor), 0) FROM journal_lines WHERE entry_id = NEW.entry_id) <> 0 THEN
    RAISE EXCEPTION 'journal entry % is unbalanced', NEW.entry_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ads_journal_balanced();

CREATE OR REPLACE FUNCTION ads_journal_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM journal_lines WHERE entry_id = NEW.id) < 2 THEN
    RAISE EXCEPTION 'journal entry % has fewer than 2 lines', NEW.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_entries_complete AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ads_journal_complete();

-- Yopilgan (yoki ochilmagan) davrga yozib bo'lmaydi — entry'ga ham, keyinroq qo'shilgan qatorga ham
CREATE OR REPLACE FUNCTION ads_period_open(d date) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE closed timestamptz;
BEGIN
  SELECT closed_at INTO closed FROM financial_periods WHERE month = date_trunc('month', d)::date FOR SHARE;
  RETURN FOUND AND closed IS NULL;
END $$;

CREATE OR REPLACE FUNCTION ads_journal_entry_period_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ads_period_open(NEW.effective_date) THEN
    RAISE EXCEPTION 'financial period of % is closed or not opened', NEW.effective_date
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_entries_period_lock BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION ads_journal_entry_period_lock();

CREATE OR REPLACE FUNCTION ads_journal_line_period_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date;
BEGIN
  SELECT effective_date INTO d FROM journal_entries WHERE id = NEW.entry_id;
  IF NOT ads_period_open(d) THEN
    RAISE EXCEPTION 'financial period of entry % is closed', NEW.entry_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_lines_period_lock BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION ads_journal_line_period_lock();

-- ── 13. Fayllar, bildirishnomalar, tizim ─────────────────────────────────────
ALTER TABLE files ADD CONSTRAINT files_ck CHECK (
      size_bytes >= 0 AND (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$')
  AND ((status = 'DELETED') = (deleted_at IS NOT NULL)));
ALTER TABLE notifications       ADD CONSTRAINT notifications_ck       CHECK (attempts >= 0);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_records_ck CHECK (expires_at > created_at);

-- ── 14. Partitioning (Prisma DDL post-processing) ────────────────────────────
-- Prisma generatsiya qilgan migratsiyada quyidagi jadvallarning CREATE TABLE oxiridagi ");" qatori
-- ") PARTITION BY RANGE (<kalit>);" ga almashtiriladi (PK allaqachon kalitni o'z ichiga oladi):
--   audit_logs (occurred_at) · device_events (occurred_at)
--   deployment_target_events (received_at) · gateway_events (received_at)
-- Default partition — xavfsizlik to'ri (monitoring: bo'sh qolishi kerak); oylik partition'larni
-- pg_partman yoki worker job 3 oy oldindan yaratadi; eski partition'lar retention bo'yicha
-- DETACH → arxiv (S3, object-lock) → DROP.
CREATE TABLE audit_logs_default               PARTITION OF audit_logs               DEFAULT;
CREATE TABLE device_events_default            PARTITION OF device_events            DEFAULT;
CREATE TABLE deployment_target_events_default PARTITION OF deployment_target_events DEFAULT;
CREATE TABLE gateway_events_default           PARTITION OF gateway_events           DEFAULT;

-- ── 15. Huquqlar va portal RLS ───────────────────────────────────────────────
-- Rollar infra'da yaratiladi: app_migrator (jadvallar egasi, faqat migratsiya job'i), app_rw (API/worker),
-- app_portal (portal API, RLS ostida), app_readonly (analitika/BI).
-- MUHIM: runtime rollar jadval egasi EMAS — ega trigger'ni o'chira oladi va RLS'dan ozod.
GRANT USAGE ON SCHEMA public TO app_rw, app_portal, app_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
-- Append-only va "hech qachon o'chirilmaydigan" jadvallar
REVOKE UPDATE, DELETE ON allocations, credit_notes, journal_entries, journal_lines, gateway_events, mrr_movements,
  mrr_snapshots, ar_aging_snapshots, subscription_revision_items, payment_order_targets, audit_logs, audit_seals,
  device_events, deployment_target_events, tuf_metadata, approval_decisions FROM app_rw;
REVOKE DELETE ON payments, refunds, subscriptions, subscription_revisions, gateway_transactions, deployments,
  clients, client_contacts, client_sites, projects, users, portal_users, devices, files, folders FROM app_rw;

CREATE OR REPLACE FUNCTION ads_portal_client_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.client_id', true), '')::uuid   -- o'rnatilmagan → NULL → hech narsa ko'rinmaydi
$$;

-- Portal faqat o'qiydi (+ checkout buyurtmasi yaratadi); har so'rov tranzaksiyada:
--   SELECT set_config('app.client_id', $clientId, true);
GRANT SELECT ON clients, client_contacts, client_sites, client_projects, projects, plans, plan_prices,
  subscriptions, subscription_revisions, subscription_revision_items, invoices, invoice_lines, credit_notes,
  payments, allocations, payment_orders, payment_order_targets, devices, device_installations, releases,
  journal_lines, portal_users TO app_portal;
GRANT INSERT ON payment_orders, payment_order_targets TO app_portal;

DO $$
DECLARE t text;
BEGIN
  -- client_id ustuni bor jadvallar: portal — faqat o'z mijozi; staff rollari — cheklovsiz
  FOREACH t IN ARRAY ARRAY['client_contacts','client_sites','client_projects','subscriptions','invoices',
                           'credit_notes','payments','allocations','payment_orders','payment_order_targets',
                           'devices','device_installations','journal_lines','portal_users'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY portal_isolation ON %I TO app_portal
                      USING (client_id = ads_portal_client_id()) WITH CHECK (client_id = ads_portal_client_id())', t);
    EXECUTE format('CREATE POLICY staff_all ON %I TO app_rw, app_readonly USING (true) WITH CHECK (true)', t);
  END LOOP;
  -- client_id'siz jadvallar: bog'langan qator orqali
  FOREACH t IN ARRAY ARRAY['clients','projects','plans','plan_prices','releases','subscription_revisions',
                           'subscription_revision_items','invoice_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY staff_all ON %I TO app_rw, app_readonly USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

CREATE POLICY portal_isolation ON clients TO app_portal USING (id = ads_portal_client_id());
CREATE POLICY portal_isolation ON projects TO app_portal USING (EXISTS (
  SELECT 1 FROM client_projects cp WHERE cp.project_id = projects.id AND cp.client_id = ads_portal_client_id()));
CREATE POLICY portal_isolation ON plans TO app_portal USING (EXISTS (
  SELECT 1 FROM client_projects cp WHERE cp.project_id = plans.project_id AND cp.client_id = ads_portal_client_id()));
CREATE POLICY portal_isolation ON plan_prices TO app_portal USING (EXISTS (
  SELECT 1 FROM plans p WHERE p.id = plan_prices.plan_id));                         -- plans RLS zanjiri
CREATE POLICY portal_isolation ON releases TO app_portal USING (EXISTS (
  SELECT 1 FROM client_projects cp WHERE cp.project_id = releases.project_id AND cp.client_id = ads_portal_client_id()));
CREATE POLICY portal_isolation ON subscription_revisions TO app_portal USING (EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.id = subscription_revisions.subscription_id));
CREATE POLICY portal_isolation ON subscription_revision_items TO app_portal USING (EXISTS (
  SELECT 1 FROM subscription_revisions r WHERE r.id = subscription_revision_items.revision_id));
CREATE POLICY portal_isolation ON invoice_lines TO app_portal USING (EXISTS (
  SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id));
-- Yangi jadvallar uchun: ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator … (infra skriptida)


-- ── Kelajakdagi migratsiyalar uchun standart huquqlar ──
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON public._prisma_migrations FROM app_rw, app_portal, app_readonly;
  END IF;
END $$;
