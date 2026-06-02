-- ============================================================
-- Drop the legacy `employees` table.
--
-- ⚠️ ONLY run this AFTER:
--   1. `migration_employees_to_hr_employees.sql` has been applied
--      (so attendance.employee_id now references hr_employees(id)).
--   2. Attendance, Overtime, Leave and Employee List have all been
--      verified against the consolidated `hr_employees` table.
--
-- This script is intentionally separate from the consolidation
-- migration so QA / UAT can perform functional verification on the
-- live data before the legacy table is retired.
-- ============================================================

USE beraucoal_attendance;

-- Pre-flight check (informational).
-- If this SELECT returns ANY rows it means a foreign key in another
-- table still points at `employees`. Resolve that before dropping —
-- typically by re-running `migration_employees_to_hr_employees.sql`.
SELECT
  TABLE_NAME      AS still_references_table,
  COLUMN_NAME     AS via_column,
  CONSTRAINT_NAME AS via_constraint
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME = 'employees';

-- Safe drop. MySQL will refuse if any FK still references `employees`
-- and the error message will name the offending constraint.
DROP TABLE IF EXISTS employees;
