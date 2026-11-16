-- Kichik jamoa: relizni yaratgan shaxs (masalan, rahbar) uni chiqarishi ham mumkin.
-- Boshqaruv — deployments.production tasdig'i orqali; kod yaxlitligi — P9'da TUF threshold imzosi.
-- Qo'lda yuritiladigan bosqichda READY reliz: tuf_role_version = 0 ("TUF imzosiz, artefakt hash'i tekshirilgan").
ALTER TABLE releases DROP CONSTRAINT releases_ck;
ALTER TABLE releases ADD CONSTRAINT releases_ck CHECK (
      version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
  AND major >= 0 AND minor >= 0 AND patch >= 0 AND version_code > 0
  AND (status NOT IN ('READY','PUBLISHED','DEPRECATED','REVOKED') OR tuf_role_version IS NOT NULL)
  AND ((status = 'REVOKED') = (revoked_at IS NOT NULL)));
