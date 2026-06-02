-- ============================================================
-- LS HR ➜ Employee List — make all form fields OPTIONAL.
--
-- Background:
-- The LS HR Officer (PIC LS) needs flexibility to register and
-- maintain vendor personnel even when the source data is not yet
-- complete (e.g. NPK / supervisor / cost center may arrive later).
-- All previously NOT NULL columns on `hr_employees` are therefore
-- relaxed to NULL, and the contract period columns are converted
-- from DATE to a free-text VARCHAR so HR can type wording such as
-- "Jan 2026 - Dec 2026" instead of picking a strict calendar date.
--
-- Workflow impact: NONE.
-- The end-to-end flow (LS → Supervisor → Vendor → PIC LS → SSU)
-- and downstream Automated Analytics still read the same column
-- names; only nullability and the PO Period storage type change.
--
-- Safe to run multiple times: every statement only widens the
-- column definition (DATE→VARCHAR, NOT NULL→NULL); re-running is
-- a no-op on a schema that has already been migrated.
-- ============================================================

USE beraucoal_attendance;

-- 1. Drop the date-range CHECK constraint that no longer applies
--    once PO Period 1 / PO Period 2 become free-text strings.
--    MySQL does not support `DROP CHECK ... IF EXISTS`, so we look
--    the constraint up in INFORMATION_SCHEMA and only run the DROP
--    when it still exists — keeps the script idempotent across
--    environments that have already been migrated.
SET @check_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME       = 'hr_employees'
    AND CONSTRAINT_NAME  = 'chk_hr_employees_po_period'
    AND CONSTRAINT_TYPE  = 'CHECK'
);
SET @drop_check_sql := IF(
  @check_exists > 0,
  'ALTER TABLE hr_employees DROP CHECK chk_hr_employees_po_period',
  'DO 0'
);
PREPARE stmt FROM @drop_check_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Vendor & contract block — all fields optional.
ALTER TABLE hr_employees
  MODIFY COLUMN vendor_number     VARCHAR(64)   NULL,
  MODIFY COLUMN user_department   VARCHAR(150)  NULL,
  MODIFY COLUMN department_title  VARCHAR(150)  NULL,
  MODIFY COLUMN vendor_name       VARCHAR(200)  NULL,
  MODIFY COLUMN employment_status ENUM('Permanent','Contract') NULL,
  MODIFY COLUMN po_number         VARCHAR(64)   NULL,
  MODIFY COLUMN po_period_1       VARCHAR(100)  NULL,
  MODIFY COLUMN po_period_2       VARCHAR(100)  NULL,
  MODIFY COLUMN dic_hro           VARCHAR(150)  NULL,
  MODIFY COLUMN cost_center       VARCHAR(64)   NULL;

-- 3. Personal identity block — all fields optional.
ALTER TABLE hr_employees
  MODIFY COLUMN npk            VARCHAR(64)  NULL,
  MODIFY COLUMN employee_name  VARCHAR(200) NULL,
  MODIFY COLUMN position       VARCHAR(150) NULL,
  MODIFY COLUMN position_group VARCHAR(150) NULL,
  MODIFY COLUMN category       VARCHAR(100) NULL,
  MODIFY COLUMN site           VARCHAR(100) NULL;

-- 4. Supervisor block — all fields optional.
ALTER TABLE hr_employees
  MODIFY COLUMN supervisor_nik  VARCHAR(64)  NULL,
  MODIFY COLUMN supervisor_name VARCHAR(200) NULL;

-- 5. `user_status` keeps its NOT NULL + DEFAULT 'Active' contract.
--    The backend coerces an empty submission to 'Active' so that
--    downstream queries that filter by Active/Deactive continue to
--    behave consistently. No ALTER required here.
