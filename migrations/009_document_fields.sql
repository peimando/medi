ALTER TABLE patients ADD COLUMN IF NOT EXISTS document_type   VARCHAR(10);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS document_number VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_patients_document ON patients(document_type, document_number);
