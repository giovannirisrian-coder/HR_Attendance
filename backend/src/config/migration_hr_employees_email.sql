-- ============================================================
-- LS HR ➜ Employee List — add OPTIONAL `email` to hr_employees.
--
-- Background:
-- The PIC LS (LS HR Officer) drives the BAST Check step in the
-- approval workflow (Employee → Leader Employee → Vendor → PIC LS
-- → SSU). Accurate contact information on the personnel master is
-- important so the Automated Analytics step and the inter-role
-- notifications (Employee, Leader, Vendor, SSU) can route reliably.
--
-- This migration adds a single OPTIONAL string column:
--   • email  VARCHAR(190) NULL
--
-- The 190-character upper bound is intentionally below the 191
-- utf8mb4 index limit so a future UNIQUE / INDEX on this column can
-- still be created without changing the default row format.
--
-- Workflow impact: NONE.
-- The end-to-end flow (Employee → Leader Employee → Vendor → PIC
-- LS → SSU) and downstream Automated Analytics queries still read
-- the same column names; this migration only ADDS a new nullable
-- column.
--
-- Safe to run multiple times:
--   The ALTER is guarded by an INFORMATION_SCHEMA lookup so the
--   ADD COLUMN is skipped on a schema that has already been
--   migrated (MySQL does not support `ADD COLUMN IF NOT EXISTS`
--   on every supported server version).
-- ============================================================

USE beraucoal_attendance;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'email'
);
SET @add_email_sql := IF(
  @col_exists = 0,
  'ALTER TABLE hr_employees ADD COLUMN email VARCHAR(190) NULL AFTER employee_name',
  'DO 0'
);
PREPARE stmt FROM @add_email_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
