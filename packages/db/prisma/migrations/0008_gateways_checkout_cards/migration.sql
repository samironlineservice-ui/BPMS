-- CreateEnum
CREATE TYPE "GatewayMode" AS ENUM ('EMULATOR', 'TEST', 'PROD');

-- CreateEnum
CREATE TYPE "PaymentOrderPurpose" AS ENUM ('CHECKOUT', 'INVOICES', 'TOPUP', 'AUTOPAY');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('PENDING', 'ACTIVE', 'REMOVED');

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "card_id" UUID,
ADD COLUMN     "failure" TEXT,
ADD COLUMN     "paid_at" TIMESTAMPTZ(6),
ADD COLUMN     "portal_user_id" UUID,
ADD COLUMN     "provider" "GatewayProvider",
ADD COLUMN     "purpose" "PaymentOrderPurpose" NOT NULL DEFAULT 'INVOICES',
ADD COLUMN     "return_path" TEXT,
ADD COLUMN     "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "payment_provider_configs" ADD COLUMN     "mode" "GatewayMode" NOT NULL DEFAULT 'EMULATOR',
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "checkout_orders" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "portal_user_id" UUID,
    "project_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "items" JSONB NOT NULL,
    "interval_months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "payment_order_id" UUID,
    "subscription_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),
    "fulfilled_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkout_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_cards" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "portal_user_id" UUID,
    "provider" "GatewayProvider" NOT NULL,
    "token_enc" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "masked_pan" TEXT NOT NULL,
    "expire" TEXT NOT NULL,
    "card_type" TEXT,
    "phone_mask" TEXT,
    "status" "CardStatus" NOT NULL DEFAULT 'PENDING',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "autopay" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_orders_code_key" ON "checkout_orders"("code");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_orders_payment_order_id_key" ON "checkout_orders"("payment_order_id");

-- CreateIndex
CREATE INDEX "checkout_orders_client_id_status_idx" ON "checkout_orders"("client_id", "status");

-- CreateIndex
CREATE INDEX "checkout_orders_status_expires_at_idx" ON "checkout_orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "payment_cards_client_id_status_idx" ON "payment_cards"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cards_one_default_uq" ON "payment_cards"("client_id") WHERE (is_default AND status = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "payment_cards_one_autopay_uq" ON "payment_cards"("client_id") WHERE (autopay AND status = 'ACTIVE');

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "payment_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cards" ADD CONSTRAINT "payment_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cards" ADD CONSTRAINT "payment_cards_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════
-- Yaxlitlik qoidalari: Paynet kanali, buyurtma/karta izchilligi, huquqlar, RLS
-- ════════════════════════════════════════════════════════════════════

-- Paynet ham gateway: to'lov faqat gateway tranzaksiyasi orqali, UZS va POSTED
ALTER TABLE payments DROP CONSTRAINT payments_channel_ck;
ALTER TABLE payments ADD CONSTRAINT payments_channel_ck CHECK (
      ((method IN ('PAYME','CLICK','UZUM','PAYNET')) = (gateway_transaction_id IS NOT NULL))
  AND (gateway_transaction_id IS NULL OR (currency = 'UZS' AND status = 'POSTED'))
  AND (status <> 'POSTED' OR gateway_transaction_id IS NOT NULL
       OR (created_by_id IS NOT NULL AND approved_by_id IS NOT NULL)));

-- To'lov buyurtmasi: maqsad ↔ tur, holat ↔ vaqt
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_purpose_ck CHECK (
      ((purpose = 'TOPUP') = (kind = 'OPEN_TOPUP'))
  AND ((status = 'PAID') = (paid_at IS NOT NULL))
  AND (card_id IS NULL OR purpose <> 'TOPUP'));

-- Checkout: summa musbat, davr ruxsat etilgan, holat ↔ vaqt/obuna
ALTER TABLE checkout_orders ADD CONSTRAINT checkout_orders_ck CHECK (
      amount_minor > 0 AND interval_months IN (1, 3, 6, 12)
  AND ((status IN ('PAID','FULFILLED')) = (paid_at IS NOT NULL))
  AND ((status = 'FULFILLED') = (fulfilled_at IS NOT NULL))
  AND (status <> 'FULFILLED' OR subscription_id IS NOT NULL));

-- Kartalar: faqat niqoblangan raqam, holat ↔ vaqt, avtomatik to'lov faqat faol kartada
ALTER TABLE payment_cards ADD CONSTRAINT payment_cards_ck CHECK (
      masked_pan ~ '\*' AND length(masked_pan) <= 25 AND expire ~ '^[0-9]{2}/[0-9]{2}$'
  AND ((status = 'REMOVED') = (removed_at IS NOT NULL))
  AND (status <> 'ACTIVE' OR verified_at IS NOT NULL)
  AND (NOT autopay OR status = 'ACTIVE')
  AND (NOT is_default OR status = 'ACTIVE'));

-- Bog'langan yozuvlar aynan shu mijozniki bo'lishi shart (IDOR'ga qarshi)
CREATE OR REPLACE FUNCTION ads_checkout_refs_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_order_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM payment_orders o WHERE o.id = NEW.payment_order_id AND o.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'checkout: payment order belongs to another client' USING ERRCODE = '23514';
  END IF;
  IF NEW.subscription_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM subscriptions s WHERE s.id = NEW.subscription_id AND s.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'checkout: subscription belongs to another client' USING ERRCODE = '23514';
  END IF;
  IF NEW.portal_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM portal_users p WHERE p.id = NEW.portal_user_id AND p.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'checkout: portal user belongs to another client' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.client_id <> OLD.client_id OR NEW.items <> OLD.items OR NEW.amount_minor <> OLD.amount_minor
                           OR NEW.currency <> OLD.currency OR NEW.interval_months <> OLD.interval_months) THEN
    RAISE EXCEPTION 'checkout: order terms are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checkout_orders_refs_check BEFORE INSERT OR UPDATE ON checkout_orders
  FOR EACH ROW EXECUTE FUNCTION ads_checkout_refs_check();

CREATE OR REPLACE FUNCTION ads_payment_order_refs_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.card_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM payment_cards c WHERE c.id = NEW.card_id AND c.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'payment order: card belongs to another client' USING ERRCODE = '23514';
  END IF;
  IF NEW.portal_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM portal_users p WHERE p.id = NEW.portal_user_id AND p.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'payment order: portal user belongs to another client' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_orders_refs_check BEFORE INSERT OR UPDATE ON payment_orders
  FOR EACH ROW EXECUTE FUNCTION ads_payment_order_refs_check();

CREATE OR REPLACE FUNCTION ads_payment_card_refs_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.portal_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM portal_users p WHERE p.id = NEW.portal_user_id AND p.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'payment card: portal user belongs to another client' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.client_id <> OLD.client_id OR NEW.provider <> OLD.provider OR NEW.masked_pan <> OLD.masked_pan) THEN
    RAISE EXCEPTION 'payment card: identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_cards_refs_check BEFORE INSERT OR UPDATE ON payment_cards
  FOR EACH ROW EXECUTE FUNCTION ads_payment_card_refs_check();

-- Huquqlar: o'chirish yo'q (holat bilan); karta tokeni va gateway sirlari analitika roliga ko'rinmaydi
REVOKE DELETE, TRUNCATE ON checkout_orders, payment_cards FROM app_rw;
REVOKE SELECT ON payment_cards FROM app_readonly;
GRANT SELECT (id, client_id, portal_user_id, provider, masked_pan, expire, card_type, phone_mask, status, is_default, autopay,
              created_at, verified_at, removed_at, last_used_at) ON payment_cards TO app_readonly;
REVOKE SELECT ON payment_provider_configs FROM app_readonly;
GRANT SELECT (provider, enabled, merchant_id, test_mode, mode, settings, updated_at) ON payment_provider_configs TO app_readonly;

-- Kabinet: checkout buyurtmalarini faqat o'qiydi (RLS). Kartalar portal roliga umuman ochilmaydi (token!) — server app_rw orqali, tokensiz select bilan.
GRANT SELECT ON checkout_orders TO app_portal;
ALTER TABLE checkout_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_isolation ON checkout_orders TO app_portal USING (client_id = ads_portal_client_id());
CREATE POLICY staff_all ON checkout_orders TO app_rw, app_readonly USING (true) WITH CHECK (true);
ALTER TABLE payment_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_all ON payment_cards TO app_rw, app_readonly USING (true) WITH CHECK (true);
