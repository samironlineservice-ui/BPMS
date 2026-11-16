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
