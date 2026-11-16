-- Global seriyalar (CL-000042, DV-000001): year = 0; yillik seriyalar (INV-2026-…): 2000..2100
ALTER TABLE document_sequences DROP CONSTRAINT document_sequences_ck;
ALTER TABLE document_sequences ADD CONSTRAINT document_sequences_ck
  CHECK (next_value >= 1 AND (year = 0 OR year BETWEEN 2000 AND 2100));
