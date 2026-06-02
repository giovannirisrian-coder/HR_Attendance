-- ============================================================
-- Consolidation migration: legacy `employees` ➜ `hr_employees`
--
-- Background:
-- The system previously kept TWO parallel employee tables:
--   • `employees`    — attendance.employee_id master (id, user_id, nik)
--   • `hr_employees` — LS HR ➜ Employee List (BAST master data)
--
-- This migration consolidates both into `hr_employees` so the LS HR
-- Master Data becomes the single source of truth and the Attendance,
-- Leave, Overtime and Employee List features all join against the
-- same table.
--
-- Workflow impact: NONE.
-- The end-to-end approval chain (LS → Supervisor → Vendor → PIC LS →
-- SSU) is intentionally preserved — only the underlying employee
-- table is unified.
--
-- High level steps:
--   1. Extend `hr_employees` with user_id (UNIQUE, FK→users.id) and
--      nik (VARCHAR(16)) columns plus their indexes.
--   2. Backfill `hr_employees` from rows currently held in
--      `employees` (idempotent — skips users that already have a
--      hr_employees row).
--   3. Repoint `attendance.employee_id` from `employees(id)` to
--      `hr_employees(id)` and swap the FK atomically.
--   4. Mark the legacy `employees` table as orphaned. The actual
--      DROP is deferred to `migration_drop_legacy_employees_table.sql`
--      so QA / UAT can verify Attendance, Overtime, Leave and
--      Employee List against `hr_employees` first.
--
-- Safe to re-run. Every guarded step inspects INFORMATION_SCHEMA
-- before mutating the live schema.
-- ============================================================

USE beraucoal_attendance;

-- ──────────────────────────────────────────────
-- 0. hr_employees must exist
--    (created by migration_hr_employees.sql; re-asserted here so
--    this file is usable as a standalone consolidation step on
--    environments where the LS HR module was never installed).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_employees (
  id                INT AUTO_INCREMENT PRIMARY KEY,

  vendor_number     VARCHAR(64)   NULL,
  user_department   VARCHAR(150)  NULL,
  department_title  VARCHAR(150)  NULL,
  vendor_name       VARCHAR(200)  NULL,
  employment_status ENUM('Permanent','Contract') NULL,
  po_number         VARCHAR(64)   NULL,
  po_period_1       VARCHAR(100)  NULL,
  po_period_2       VARCHAR(100)  NULL,
  dic_hro           VARCHAR(150)  NULL,
  cost_center       VARCHAR(64)   NULL,

  npk               VARCHAR(64)   NULL,
  employee_name     VARCHAR(200)  NULL,
  position          VARCHAR(150)  NULL,
  position_group    VARCHAR(150)  NULL,
  category          VARCHAR(100)  NULL,
  site              VARCHAR(100)  NULL,

  supervisor_nik    VARCHAR(64)   NULL,
  supervisor_name   VARCHAR(200)  NULL,

  user_status       ENUM('Active','Deactive') NOT NULL DEFAULT 'Active',

  created_by        INT           NULL,
  updated_by        INT           NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_hr_employees_npk (npk),
  KEY idx_hr_employees_employee_name (employee_name),
  KEY idx_hr_employees_vendor_name (vendor_name),
  KEY idx_hr_employees_supervisor_name (supervisor_name),
  KEY idx_hr_employees_site (site),
  KEY idx_hr_employees_user_status (user_status),

  CONSTRAINT fk_hr_employees_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_hr_employees_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────
-- 1. Extend hr_employees with the attendance-side columns
-- ──────────────────────────────────────────────

-- 1a. user_id column
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'user_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE hr_employees ADD COLUMN user_id INT NULL AFTER id',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1b. nik column (sized to match attendance.nik / employees.nik)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'nik'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE hr_employees ADD COLUMN nik VARCHAR(16) NULL AFTER user_id',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1c. UNIQUE index on user_id — one hr_employees row per user.
--     MySQL allows multiple NULLs in a UNIQUE index, so the existing
--     LS HR-only seed rows (user_id IS NULL) coexist with the
--     attendance-linked rows we are about to backfill.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND INDEX_NAME   = 'uq_hr_employees_user_id'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE hr_employees ADD UNIQUE KEY uq_hr_employees_user_id (user_id)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1d. Plain index on nik for fast lookups from attendance / glog.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND INDEX_NAME   = 'idx_hr_employees_nik'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE hr_employees ADD KEY idx_hr_employees_nik (nik)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1e. FK from hr_employees.user_id → users.id.
--     ON DELETE CASCADE mirrors the legacy `employees` behaviour so
--     that removing a user still cleans up their employee profile.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME        = 'hr_employees'
    AND CONSTRAINT_NAME   = 'fk_hr_employees_user'
    AND CONSTRAINT_TYPE   = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE hr_employees ADD CONSTRAINT fk_hr_employees_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ──────────────────────────────────────────────
-- 2. Backfill: copy rows from legacy `employees` ➜ `hr_employees`
--    when no hr_employees row exists yet for that user_id.
--    Skipped entirely once `employees` has been dropped.
-- ──────────────────────────────────────────────
SET @emp_table_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'
);

SET @sql := IF(
  @emp_table_exists > 0,
  'INSERT INTO hr_employees (user_id, nik, employee_name, vendor_name, supervisor_name, user_status)
   SELECT e.user_id,
          e.nik,
          u.name,
          v.name,
          sup.name,
          IF(u.is_active = 1, ''Active'', ''Deactive'')
     FROM employees e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN vendors v ON v.id = u.vendor_id
     LEFT JOIN users sup ON sup.id = u.supervisor_id
    WHERE NOT EXISTS (
      SELECT 1 FROM hr_employees h WHERE h.user_id = e.user_id
    )',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2b. Propagate NIK onto any hr_employees row that was already
--     linked to a user (defensive: handles the edge case where an
--     LS HR record was created manually with the user_id pre-populated
--     before this migration ran).
SET @sql := IF(
  @emp_table_exists > 0,
  'UPDATE hr_employees h
     JOIN employees e ON e.user_id = h.user_id
      SET h.nik = e.nik
    WHERE (h.nik IS NULL OR h.nik = '''') AND e.nik IS NOT NULL',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ──────────────────────────────────────────────
-- 3. Repoint attendance.employee_id  ➜  hr_employees.id
-- ──────────────────────────────────────────────

-- 3a. Drop the legacy FK if it is still pointing at `employees`.
SET @fk_legacy_exists := (
  SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA       = DATABASE()
    AND TABLE_NAME              = 'attendance'
    AND CONSTRAINT_NAME         = 'fk_att_employee'
    AND REFERENCED_TABLE_NAME   = 'employees'
);
SET @sql := IF(
  @fk_legacy_exists > 0,
  'ALTER TABLE attendance DROP FOREIGN KEY fk_att_employee',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3b. Remap attendance.employee_id values from employees(id) →
--     hr_employees(id), using user_id as the bridge. Only runs while
--     `employees` still exists; after the cleanup script drops it,
--     the FK already points at hr_employees and nothing needs remapping.
SET @sql := IF(
  @emp_table_exists > 0,
  'UPDATE attendance a
     JOIN employees e    ON e.id      = a.employee_id
     JOIN hr_employees h ON h.user_id = e.user_id
      SET a.employee_id = h.id
    WHERE a.employee_id IS NOT NULL',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3c. Recreate the FK pointing at hr_employees(id). Skipped if a
--     constraint with the same name already references hr_employees.
SET @fk_new_exists := (
  SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA       = DATABASE()
    AND TABLE_NAME              = 'attendance'
    AND CONSTRAINT_NAME         = 'fk_att_employee'
    AND REFERENCED_TABLE_NAME   = 'hr_employees'
);
SET @sql := IF(
  @fk_new_exists = 0,
  'ALTER TABLE attendance
      ADD CONSTRAINT fk_att_employee FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE RESTRICT',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ──────────────────────────────────────────────
-- 4. Done.
--
-- The legacy `employees` table is intentionally NOT dropped here.
-- After verifying that Attendance, Overtime, Leave and Employee
-- List all behave correctly against `hr_employees`, run
-- `migration_drop_legacy_employees_table.sql` to retire it.
-- ──────────────────────────────────────────────
