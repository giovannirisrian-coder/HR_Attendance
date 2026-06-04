-- ============================================================
-- LS HR ➜ Employee List — ADD mandatory `sid` column to
--                         hr_employees.
--
-- Background:
-- The PIC LS (LS HR Officer) maintains the consolidated employee
-- master that feeds the Automated Analytics stage (BAST Check,
-- Invoice / Tax / Salary Recap). Per stakeholder feedback every
-- employee must carry a unique, REQUIRED "SID" (System ID) so the
-- downstream reporting is error-free.
--
-- Data type: free-text VARCHAR. The column is added as NULL at the
-- database level so this migration is safe to run against a table
-- that already holds rows (legacy / bulk-uploaded records that
-- predate the SID requirement) and so the seed inserts in
-- schema.sql keep working unchanged. The "required" / not-null
-- constraint is enforced at the application layer:
--   • backend validateBody() rejects an empty SID on POST/PUT
--     (/api/employees), and
--   • the Create / Edit Employee forms mark the field as required.
-- Once historical rows are backfilled the column can be tightened
-- with `ALTER TABLE hr_employees MODIFY sid VARCHAR(64) NOT NULL;`.
--
-- Workflow impact: NONE.
-- The end-to-end flow (Employee → Leader Employee → Vendor → PIC
-- LS → SSU) is unchanged; this migration only ADDs one nullable
-- column.
--
-- Safe to run multiple times:
--   The ADD is guarded by an INFORMATION_SCHEMA lookup so it is
--   skipped on a schema that already has the column (MySQL does
--   not support `ADD COLUMN IF NOT EXISTS` on every supported
--   server version).
-- ============================================================

USE beraucoal_attendance;

DROP PROCEDURE IF EXISTS hr_employees_add_sid_if_missing;
DELIMITER //
CREATE PROCEDURE hr_employees_add_sid_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND COLUMN_NAME  = 'sid'
  ) THEN
    ALTER TABLE hr_employees
      ADD COLUMN sid VARCHAR(64) NULL AFTER npk;
  END IF;
END //
DELIMITER ;

CALL hr_employees_add_sid_if_missing();

DROP PROCEDURE IF EXISTS hr_employees_add_sid_if_missing;
