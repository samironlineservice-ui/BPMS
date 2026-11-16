-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('INVITE', 'PASSWORD_RESET', 'EMAIL_VERIFY');

-- AlterTable
ALTER TABLE "mfa_factors" ADD COLUMN     "last_used_step" BIGINT;

-- CreateTable
CREATE TABLE "auth_tokens" (
    "token_hash" TEXT NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "user_id" UUID,
    "portal_user_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_idx" ON "auth_tokens"("user_id");

-- CreateIndex
CREATE INDEX "auth_tokens_portal_user_id_idx" ON "auth_tokens"("portal_user_id");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Token aynan bitta egaga tegishli (xodim yoki portal foydalanuvchisi)
ALTER TABLE "auth_tokens" ADD CONSTRAINT auth_tokens_owner_ck CHECK ((user_id IS NULL) <> (portal_user_id IS NULL));
