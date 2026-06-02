-- ============================================================
-- LS HR ➜ Employee List — promote `vendor_number` free-text into
-- a true relationship between `hr_employees` and `vendors`.
--
-- Background:
-- The PIC LS (LS HR Officer) owns the BAST Check step in the
-- workflow (Employee → Leader → Vendor → PIC LS → SSU). The
-- downstream Automated Analytics stage (Invoices, Tax, Salary
-- Recap) joins personnel data against the `vendors` master so it
-- can attribute hours / payroll to the correct contractor. Until
-- now `hr_employees.vendor_number` and `hr_employees.vendor_name`
-- were free-text strings entered by HR, which made it easy to
-- introduce typos that broke the vendor → invoice attribution.
--
-- This migration adds a single OPTIONAL relationship column:
--   • vendor_id  INT NULL  FK → vendors(id)  ON DELETE SET NULL
--
-- Plus a backfill that links every existing hr_employees row to
-- the matching vendor (by exact `vendors.code` match first, then a
-- case-insensitive `vendors.name` match) so historical records
-- keep displaying the same vendor through the new join. Rows that
-- cannot be matched are left with vendor_id IS NULL — HR can pick
-- the correct vendor from the new searchable lookup at any time.
--
-- The legacy `vendor_number` / `vendor_name` columns are kept in
-- place as denormalized display copies:
--   • when a vendor is selected via the new lookup, the backend
--     writes vendors.code → vendor_number and vendors.name →
--     vendor_name so legacy consumers and analytics that still
--     read those columns keep working unchanged;
--   • rows with no vendor link continue to honour whatever string
--     HR typed in (no breaking change for partial / draft data).
--
-- Workflow impact: NONE.
-- The end-to-end approval chain (LS → Leader → Vendor → PIC LS →
-- SSU) is unchanged — only the underlying vendor reference type
-- is upgraded from free-text to a foreign key.
--
-- Safe to re-run. Every step is guarded by INFORMATION_SCHEMA so
-- the script is idempotent across QA / UAT / Production.
-- ============================================================

USE beraucoal_attendance;

-- 1. Add the `vendor_id` column if it is not already present.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'vendor_id'
);
SET @add_col_sql := IF(
  @col_exists = 0,
  'ALTER TABLE hr_employees ADD COLUMN vendor_id INT NULL AFTER user_id',
  'DO 0'
);
PREPARE stmt FROM @add_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Index on `vendor_id` so list queries that filter by vendor
--    (LS HR Employee List) stay fast even with thousands of rows.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND INDEX_NAME   = 'idx_hr_employees_vendor_id'
);
SET @add_idx_sql := IF(
  @idx_exists = 0,
  'ALTER TABLE hr_employees ADD KEY idx_hr_employees_vendor_id (vendor_id)',
  'DO 0'
);
PREPARE stmt FROM @add_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Foreign key → vendors(id). ON DELETE SET NULL keeps the row
--    around (employee history matters) and clears the dangling
--    reference if a vendor is ever removed from the master list.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME        = 'hr_employees'
    AND CONSTRAINT_NAME   = 'fk_hr_employees_vendor'
    AND CONSTRAINT_TYPE   = 'FOREIGN KEY'
);
SET @add_fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE hr_employees ADD CONSTRAINT fk_hr_employees_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE stmt FROM @add_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Backfill — link existing rows to the matching vendor record.
--    Only fills rows that do not already have a vendor_id.
--
--    Match priority:
--      4a. Exact `vendors.code` match on `vendor_number` (preferred
--          — code is unique).
--      4b. Case-insensitive `vendors.name` match on `vendor_name`
--          (best-effort — vendor names should be unique but the
--          column is not UNIQUE, so we only update when there is
--          exactly one candidate to avoid mis-attribution).
ALTER TABLE hr_employees
  MODIFY COLUMN vendor_id INT NULL;

UPDATE hr_employees h
  JOIN vendors v ON v.code = h.vendor_number
   SET h.vendor_id = v.id
 WHERE h.vendor_id IS NULL
   AND h.vendor_number IS NOT NULL
   AND h.vendor_number <> '';

UPDATE hr_employees h
  JOIN vendors v
    ON LOWER(v.name) = LOWER(h.vendor_name)
   AND (
     SELECT COUNT(*) FROM vendors v2
      WHERE LOWER(v2.name) = LOWER(h.vendor_name)
   ) = 1
   SET h.vendor_id = v.id
 WHERE h.vendor_id IS NULL
   AND h.vendor_name IS NOT NULL
   AND h.vendor_name <> '';

-- 5. Normalize the denormalized display copies for the rows we
--    just linked so the legacy columns stay in lock-step with the
--    new vendor reference. Rows that were not auto-linked keep
--    their original free-text values untouched.
UPDATE hr_employees h
  JOIN vendors v ON v.id = h.vendor_id
   SET h.vendor_number = v.code,
       h.vendor_name   = v.name
 WHERE h.vendor_id IS NOT NULL;
