-- CreateEnum
CREATE TYPE "ClientRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClientRequestCategory" AS ENUM ('SUPPORT', 'CHANGE', 'BILLING', 'DEVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CLIENT', 'STAFF');

-- CreateTable
CREATE TABLE "client_requests" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "category" "ClientRequestCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ClientRequestStatus" NOT NULL DEFAULT 'OPEN',
    "subscription_id" UUID,
    "device_id" UUID,
    "created_by_portal_user_id" UUID,
    "created_by_user_id" UUID,
    "assignee_id" UUID,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_by" "MessageAuthor" NOT NULL DEFAULT 'CLIENT',
    "staff_seen_at" TIMESTAMPTZ(6),
    "client_seen_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_request_messages" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "author_user_id" UUID,
    "author_portal_user_id" UUID,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_request_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_requests_code_key" ON "client_requests"("code");

-- CreateIndex
CREATE INDEX "client_requests_client_id_status_idx" ON "client_requests"("client_id", "status");

-- CreateIndex
CREATE INDEX "client_requests_status_last_message_at_idx" ON "client_requests"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "client_request_messages_request_id_created_at_idx" ON "client_request_messages"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_created_by_portal_user_id_fkey" FOREIGN KEY ("created_by_portal_user_id") REFERENCES "portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_request_messages" ADD CONSTRAINT "client_request_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "client_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_request_messages" ADD CONSTRAINT "client_request_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_request_messages" ADD CONSTRAINT "client_request_messages_author_portal_user_id_fkey" FOREIGN KEY ("author_portal_user_id") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════
-- Yaxlitlik qoidalari (Prisma ko'rmaydi): CHECK, trigger'lar, huquqlar, RLS
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "client_requests"
  ADD CONSTRAINT "client_requests_subject_ck" CHECK (length(btrim(subject)) BETWEEN 3 AND 200),
  ADD CONSTRAINT "client_requests_creator_ck" CHECK (created_by_portal_user_id IS NOT NULL OR created_by_user_id IS NOT NULL),
  ADD CONSTRAINT "client_requests_closed_ck" CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL));

ALTER TABLE "client_request_messages"
  ADD CONSTRAINT "client_request_messages_body_ck" CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  ADD CONSTRAINT "client_request_messages_author_ck" CHECK (
        (author = 'CLIENT' AND author_portal_user_id IS NOT NULL AND author_user_id IS NULL AND NOT is_internal)
     OR (author = 'STAFF'  AND author_user_id IS NOT NULL AND author_portal_user_id IS NULL));

-- Bog'langan obuna/qurilma/portal foydalanuvchisi aynan shu mijozniki bo'lishi shart (IDOR'ga qarshi)
CREATE OR REPLACE FUNCTION ads_client_request_refs_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subscription_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM subscriptions s WHERE s.id = NEW.subscription_id AND s.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'client_request: subscription % belongs to another client', NEW.subscription_id USING ERRCODE = '23514';
  END IF;
  IF NEW.device_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM devices d WHERE d.id = NEW.device_id AND d.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'client_request: device % belongs to another client', NEW.device_id USING ERRCODE = '23514';
  END IF;
  IF NEW.created_by_portal_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM portal_users p WHERE p.id = NEW.created_by_portal_user_id AND p.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'client_request: portal user belongs to another client' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.client_id <> OLD.client_id THEN
    RAISE EXCEPTION 'client_request: client_id is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_requests_refs_check BEFORE INSERT OR UPDATE ON client_requests
  FOR EACH ROW EXECUTE FUNCTION ads_client_request_refs_check();

CREATE OR REPLACE FUNCTION ads_client_request_message_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM client_requests r WHERE r.id = NEW.request_id AND r.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'client_request_message: client mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.author_portal_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM portal_users p WHERE p.id = NEW.author_portal_user_id AND p.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'client_request_message: portal user belongs to another client' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_request_messages_check BEFORE INSERT ON client_request_messages
  FOR EACH ROW EXECUTE FUNCTION ads_client_request_message_check();

-- Xabarlar append-only
CREATE TRIGGER client_request_messages_append_only BEFORE UPDATE OR DELETE ON client_request_messages
  FOR EACH ROW EXECUTE FUNCTION ads_forbid_mutation();

-- Huquqlar: app_rw — o'chirish yo'q (yopish = status); app_portal — faqat o'qish (RLS ostida)
REVOKE DELETE, TRUNCATE ON client_requests FROM app_rw;
REVOKE UPDATE, DELETE, TRUNCATE ON client_request_messages FROM app_rw;
GRANT SELECT ON client_requests, client_request_messages TO app_portal;

ALTER TABLE client_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_isolation ON client_requests TO app_portal
  USING (client_id = ads_portal_client_id());
CREATE POLICY staff_all ON client_requests TO app_rw, app_readonly USING (true) WITH CHECK (true);

ALTER TABLE client_request_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_isolation ON client_request_messages TO app_portal
  USING (client_id = ads_portal_client_id() AND NOT is_internal);   -- ichki izohlar mijozga ko'rinmaydi
CREATE POLICY staff_all ON client_request_messages TO app_rw, app_readonly USING (true) WITH CHECK (true);
