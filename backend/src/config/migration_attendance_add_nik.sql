-- Add NIK (Nomor Induk Kependudukan) to attendance rows for LS records.
-- Safe for existing databases: nullable column, no data loss.

USE beraucoal_attendance;

ALTER TABLE attendance
  ADD COLUMN nik VARCHAR(16) NULL
  AFTER user_id;
