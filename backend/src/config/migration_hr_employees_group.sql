-- ============================================================
-- LS HR ➜ Employee List — add OPTIONAL "Group" classification
--                         (BC / MTL) to hr_employees.
--
-- Background:
-- The PIC LS (LS HR Officer) drives the BAST Check step in the
-- approval workflow (Employee → Leader Employee → Vendor → PIC LS
-- → SSU). Categorising each employee under a coarse Group
-- (BC = Berau Coal, MTL = Mitra Tama Lestari et al.) is what
-- ultimately lets the Automated Analytics step bucket recap rows
-- correctly for audit and payroll reporting.
--
-- This migration adds a single OPTIONAL enum column:
--   • employee_group  ENUM('BC','MTL') NULL
--
-- The SQL identifier is `employee_group` (not `group`) because
-- GROUP is a reserved word in MySQL. The frontend / API still
-- present the field as "Group" — only the column name differs.
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
    AND COLUMN_NAME  = 'employee_group'
);
SET @add_group_sql := IF(
  @col_exists = 0,
  "ALTER TABLE hr_employees ADD COLUMN employee_group ENUM('BC','MTL') NULL AFTER category",
  'DO 0'
);
PREPARE stmt FROM @add_group_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
