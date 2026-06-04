-- ============================================================
-- LS HR ➜ Employee List — REFACTOR audit columns
--   hr_employees.created_by / updated_by:  INT FK  ➜  NAME (string)
--
-- Background:
-- The PIC LS (LS HR Officer) maintains the consolidated employee
-- master that feeds the Automated Analytics stage (BAST Check,
-- Document Check, Salary Recap). For high-transparency reporting the
-- audit trail must show WHO performed an action by NAME, not by an
-- opaque numeric user id. The backend now resolves the authenticated
-- requester's `users.name` at write time and stores that string into
-- `created_by` / `updated_by`.
--
-- What this migration does (idempotent / safe to re-run):
--   1. Drops the legacy FOREIGN KEY constraints that tied the audit
--      columns to users(id) — a name string can never satisfy them.
--   2. Widens `created_by` / `updated_by` from INT to VARCHAR(150)
--      (same length as users.name). Only altered when still INT, so a
--      second run is a no-op.
--   3. Backfills existing rows: while the column still holds the legacy
--      numeric id (as a string after the widen), it JOINs back to
--      `users` and swaps in the matching name. The `REGEXP '^[0-9]+$'`
--      guard means only un-migrated numeric values are touched, so
--      rows already carrying a name — and a re-run of this script —
--      are left untouched. Orphan ids (user deleted) keep their raw
--      value rather than being lost, so nothing is silently dropped.
--
-- Workflow impact: NONE.
-- The end-to-end approval flow (Employee → Leader Employee → Vendor →
-- PIC LS → SSU) and all approval states are unchanged; this migration
-- only changes how the audit metadata is stored.
-- ============================================================

USE beraucoal_attendance;

DROP PROCEDURE IF EXISTS hr_employees_audit_name_migrate;
DELIMITER //
CREATE PROCEDURE hr_employees_audit_name_migrate()
BEGIN
  -- 1. Drop legacy FK constraints (created_by / updated_by → users.id).
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME       = 'hr_employees'
      AND CONSTRAINT_NAME  = 'fk_hr_employees_created_by'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE hr_employees DROP FOREIGN KEY fk_hr_employees_created_by;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME       = 'hr_employees'
      AND CONSTRAINT_NAME  = 'fk_hr_employees_updated_by'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE hr_employees DROP FOREIGN KEY fk_hr_employees_updated_by;
  END IF;

  -- 2. Widen the columns to free-text NAME holders (only while INT).
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND COLUMN_NAME  = 'created_by'
      AND DATA_TYPE    = 'int'
  ) THEN
    ALTER TABLE hr_employees MODIFY created_by VARCHAR(150) NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND COLUMN_NAME  = 'updated_by'
      AND DATA_TYPE    = 'int'
  ) THEN
    ALTER TABLE hr_employees MODIFY updated_by VARCHAR(150) NULL;
  END IF;

  -- 3. Backfill legacy numeric ids with the matching users.name.
  UPDATE hr_employees h
    JOIN users u ON u.id = h.created_by
     SET h.created_by = u.name
   WHERE h.created_by REGEXP '^[0-9]+$';

  UPDATE hr_employees h
    JOIN users u ON u.id = h.updated_by
     SET h.updated_by = u.name
   WHERE h.updated_by REGEXP '^[0-9]+$';
END //
DELIMITER ;

CALL hr_employees_audit_name_migrate();

DROP PROCEDURE IF EXISTS hr_employees_audit_name_migrate;
