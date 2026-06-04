-- ============================================================
-- LS HR ➜ Employee List — DROP deprecated / redundant columns
--                         from hr_employees.
--
-- Background:
-- As the system transitions toward Automated Analytics and BAST
-- Check, the master data is being kept as lean and relevant as
-- possible so the PIC LS can focus on high-priority reporting
-- fields. The columns below are no longer captured anywhere in the
-- LS HR Officer's Create / Edit Employee forms and are removed:
--
--   • department_title
--   • employment_status
--   • po_number
--   • po_period_1
--   • po_period_2
--   • dic_hro
--   • cost_center
--   • category
--
-- Workflow impact: NONE.
-- The end-to-end flow (Employee → Leader Employee → Vendor → PIC
-- LS → SSU) and downstream Attendance / Overtime / SSU document
-- checks never read these columns; this migration only DROPS
-- unused nullable columns.
--
-- Safe to run multiple times:
--   Each DROP is guarded by an INFORMATION_SCHEMA lookup so it is
--   skipped on a schema that has already been migrated (MySQL does
--   not support `DROP COLUMN IF EXISTS` on every supported server
--   version).
-- ============================================================

USE beraucoal_attendance;

-- Reusable helper: drop a column only when it still exists.
DROP PROCEDURE IF EXISTS hr_employees_drop_column_if_exists;
DELIMITER //
CREATE PROCEDURE hr_employees_drop_column_if_exists(IN col_name VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND COLUMN_NAME  = col_name
  ) THEN
    SET @drop_sql := CONCAT('ALTER TABLE hr_employees DROP COLUMN `', col_name, '`');
    PREPARE stmt FROM @drop_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL hr_employees_drop_column_if_exists('department_title');
CALL hr_employees_drop_column_if_exists('employment_status');
CALL hr_employees_drop_column_if_exists('po_number');
CALL hr_employees_drop_column_if_exists('po_period_1');
CALL hr_employees_drop_column_if_exists('po_period_2');
CALL hr_employees_drop_column_if_exists('dic_hro');
CALL hr_employees_drop_column_if_exists('cost_center');
CALL hr_employees_drop_column_if_exists('category');

DROP PROCEDURE IF EXISTS hr_employees_drop_column_if_exists;
