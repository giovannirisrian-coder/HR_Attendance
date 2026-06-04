-- ============================================================
-- Users — SID-based authentication migration.
--
-- Background:
-- Authentication moves from Email + Password to SID + Password so the
-- unique System ID (captured by the PIC LS on the Employee List) is the
-- single identitas that travels from Biometric Capture all the way to
-- Automated Analytics. To support this — and to stop user-account
-- auto-provisioning from failing when no email is supplied — this
-- migration:
--
--   1. ADDs `users.sid` (VARCHAR(64), same type as hr_employees.sid).
--   2. ADDs a UNIQUE index on `users.sid` so login lookups are fast and
--      every account carries a distinct SID. MySQL treats multiple NULLs
--      as non-equal, so legacy rows that have not been backfilled yet
--      remain valid.
--   3. RELAXES `users.email` to NULL. Email is no longer a credential, so
--      provisioning an LS account with a NULL email must not be blocked
--      by a NOT NULL constraint. The existing UNIQUE index is preserved
--      (multiple NULLs are allowed in MySQL/InnoDB).
--
-- Workflow impact: NONE.
-- The stakeholder chain (Employee → Leader → Vendor → PIC LS → SSU) is
-- unchanged; only the credential field and the email nullability change.
--
-- Safe to run multiple times:
--   Every statement is guarded by an INFORMATION_SCHEMA lookup so the
--   migration is idempotent across all supported MySQL versions.
-- ============================================================

USE beraucoal_attendance;

-- 1 + 2. Add `sid` column and its UNIQUE index when missing.
DROP PROCEDURE IF EXISTS users_add_sid_if_missing;
DELIMITER //
CREATE PROCEDURE users_add_sid_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'sid'
  ) THEN
    ALTER TABLE users
      ADD COLUMN sid VARCHAR(64) NULL AFTER employee_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND INDEX_NAME   = 'uq_users_sid'
  ) THEN
    ALTER TABLE users
      ADD UNIQUE KEY uq_users_sid (sid);
  END IF;
END //
DELIMITER ;

CALL users_add_sid_if_missing();
DROP PROCEDURE IF EXISTS users_add_sid_if_missing;

-- 3. Relax `email` to NULL so account creation never fails when no email
--    is provided (authentication is now SID-based).
SET @email_nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'email'
);

SET @relax_sql := IF(
  @email_nullable = 'NO',
  'ALTER TABLE users MODIFY COLUMN email VARCHAR(150) NULL',
  'DO 0'
);
PREPARE stmt FROM @relax_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
