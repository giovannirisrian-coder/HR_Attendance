-- ============================================================
-- Users — First-Time Login "Force Password Change" migration.
--
-- Background:
-- Accounts are auto-provisioned by the PIC LS (LS HR Officer) from the
-- Employee List with a default password ("password"). To guarantee
-- account integrity, every freshly created user must change that default
-- password before they are allowed to enter the digital workflow.
--
-- This migration adds `users.is_first_login` (BOOLEAN / TINYINT(1)) with
-- DEFAULT 1 (TRUE). Newly provisioned accounts therefore start flagged,
-- and the flag is cleared to 0 (FALSE) the first time the user submits a
-- new password via POST /api/auth/change-password.
--
-- Workflow impact: NONE.
-- The stakeholder chain (Employee → Leader → Vendor → PIC LS → SSU) is
-- unchanged; this only gates the very first sign-in of each account.
--
-- Existing rows: backfilled to 0 (FALSE) so already-onboarded users (and
-- the seed/demo accounts) are NOT forced to change their password.
--
-- Safe to run multiple times:
--   The column add is guarded by an INFORMATION_SCHEMA lookup so the
--   migration is idempotent across all supported MySQL versions.
-- ============================================================

USE beraucoal_attendance;

DROP PROCEDURE IF EXISTS users_add_first_login_if_missing;
DELIMITER //
CREATE PROCEDURE users_add_first_login_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'is_first_login'
  ) THEN
    ALTER TABLE users
      ADD COLUMN is_first_login TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active;

    -- Backfill: existing accounts have already chosen a password, so they
    -- must not be forced through the change-password flow.
    UPDATE users SET is_first_login = 0;
  END IF;
END //
DELIMITER ;

CALL users_add_first_login_if_missing();
DROP PROCEDURE IF EXISTS users_add_first_login_if_missing;
