-- ============================================================
-- LS HR ➜ Employee List — promote `supervisor_nik` / `supervisor_name`
-- free-text into a true relationship between `hr_employees` and the
-- `users` master (role = 'ls_supervisor').
--
-- Background:
-- The Managerial Review stage of the workflow (Employee → Leader
-- Employee → Vendor → PIC LS → SSU) depends on the relationship
-- between an LS employee and their Leader Employee (LS Supervisor).
-- Until now the supervisor was captured on `hr_employees` as two
-- free-text columns:
--   • supervisor_nik   VARCHAR(64)
--   • supervisor_name  VARCHAR(200)
-- which made it easy for PIC LS to introduce typos that broke the
-- audit trail when the Leader subsequently approved attendance,
-- leave or overtime via their `users.id` identity.
--
-- This migration replaces both columns with a single relationship
-- column:
--   • supervisor_id  INT NULL  FK → users(id)  ON DELETE SET NULL
--
-- Plus a backfill that links every existing hr_employees row to the
-- matching `users` record where the user has role='ls_supervisor':
--   1. exact match on `users.employee_id` against the legacy
--      `supervisor_nik` (preferred — employee_id is unique);
--   2. case-insensitive single-match on `users.name` against the
--      legacy `supervisor_name` (only updated when there is exactly
--      one candidate to avoid mis-attribution).
-- Rows that cannot be matched are left with supervisor_id IS NULL —
-- HR can pick the correct supervisor from the new searchable lookup
-- at any time (the field is OPTIONAL by design).
--
-- Workflow impact: NONE.
-- The end-to-end approval chain (Employee → Leader Employee →
-- Vendor → PIC LS → SSU) is unchanged — only the underlying
-- supervisor reference type is upgraded from free-text to a foreign
-- key.
--
-- Safe to re-run. Every step is guarded by INFORMATION_SCHEMA so
-- the script is idempotent across QA / UAT / Production.
-- ============================================================

USE beraucoal_attendance;

-- 1. Add the `supervisor_id` column if it is not already present.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'supervisor_id'
);
SET @add_col_sql := IF(
  @col_exists = 0,
  'ALTER TABLE hr_employees ADD COLUMN supervisor_id INT NULL AFTER site',
  'DO 0'
);
PREPARE stmt FROM @add_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Index on `supervisor_id` so list queries that join `users` to
--    show the supervisor name stay fast even with thousands of rows.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND INDEX_NAME   = 'idx_hr_employees_supervisor_id'
);
SET @add_idx_sql := IF(
  @idx_exists = 0,
  'ALTER TABLE hr_employees ADD KEY idx_hr_employees_supervisor_id (supervisor_id)',
  'DO 0'
);
PREPARE stmt FROM @add_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Foreign key → users(id). ON DELETE SET NULL keeps the row
--    around (employee history matters) and clears the dangling
--    reference if a supervisor user is ever removed.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME        = 'hr_employees'
    AND CONSTRAINT_NAME   = 'fk_hr_employees_supervisor'
    AND CONSTRAINT_TYPE   = 'FOREIGN KEY'
);
SET @add_fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE hr_employees ADD CONSTRAINT fk_hr_employees_supervisor FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE stmt FROM @add_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Backfill — link existing rows to the matching users row.
--    Only fills rows that do not already have a supervisor_id and
--    only consults users with role='ls_supervisor' so we never
--    accidentally point an employee at a non-supervisor account.

-- 4a. Exact `users.employee_id` match against the legacy
--     `supervisor_nik` (preferred — employee_id is unique).
SET @nik_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'supervisor_nik'
);
SET @sql := IF(
  @nik_col_exists > 0,
  'UPDATE hr_employees h
     JOIN users u
       ON u.employee_id = h.supervisor_nik
      AND u.role = ''ls_supervisor''
      SET h.supervisor_id = u.id
    WHERE h.supervisor_id IS NULL
      AND h.supervisor_nik IS NOT NULL
      AND h.supervisor_nik <> ''''',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4b. Case-insensitive `users.name` match against the legacy
--     `supervisor_name` — only updated when there is exactly one
--     candidate so a duplicate name never causes mis-attribution.
SET @name_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'supervisor_name'
);
SET @sql := IF(
  @name_col_exists > 0,
  'UPDATE hr_employees h
     JOIN users u
       ON LOWER(u.name) = LOWER(h.supervisor_name)
      AND u.role = ''ls_supervisor''
      AND (
        SELECT COUNT(*) FROM users u2
         WHERE LOWER(u2.name) = LOWER(h.supervisor_name)
           AND u2.role = ''ls_supervisor''
      ) = 1
      SET h.supervisor_id = u.id
    WHERE h.supervisor_id IS NULL
      AND h.supervisor_name IS NOT NULL
      AND h.supervisor_name <> ''''',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. Drop the legacy `idx_hr_employees_supervisor_name` index — the
--    column it covers is about to disappear and the new column has
--    its own index added in step 2.
SET @old_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND INDEX_NAME   = 'idx_hr_employees_supervisor_name'
);
SET @drop_idx_sql := IF(
  @old_idx_exists > 0,
  'ALTER TABLE hr_employees DROP INDEX idx_hr_employees_supervisor_name',
  'DO 0'
);
PREPARE stmt FROM @drop_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. Drop the legacy `supervisor_nik` column.
SET @drop_col_sql := IF(
  @nik_col_exists > 0,
  'ALTER TABLE hr_employees DROP COLUMN supervisor_nik',
  'DO 0'
);
PREPARE stmt FROM @drop_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7. Drop the legacy `supervisor_name` column.
SET @drop_col_sql := IF(
  @name_col_exists > 0,
  'ALTER TABLE hr_employees DROP COLUMN supervisor_name',
  'DO 0'
);
PREPARE stmt FROM @drop_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
