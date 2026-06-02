-- ============================================================
-- Cancel / Withdraw statuses for LS-driven requests.
--
-- Adds two new terminal statuses so the LS (employee) can stop a
-- submission they no longer want without breaking the existing
-- sequential approval chain (LS → Supervisor → Vendor → LS HR → SSU):
--
--   • cancelled  → LS aborts a still-pending request
--   • withdrawn  → LS pulls back a request that was already approved
--
-- These rows are intentionally NOT counted by Managerial Review
-- alerts, the Monthly Attendance Recap, BAST generation, or any
-- payroll / invoice analytic — see the controller refactor that
-- ships alongside this migration.
--
-- Safe to run multiple times: MODIFY COLUMN is idempotent when the
-- target enum already contains the new members.
-- ============================================================

USE beraucoal_attendance;

-- Attendance correction rows. `superseded` is kept because the
-- correction approval flow already uses it to retire the original
-- machine row when a correction is approved.
ALTER TABLE attendance
  MODIFY COLUMN status ENUM(
    'pending',
    'approved',
    'rejected',
    'superseded',
    'cancelled',
    'withdrawn'
  ) NOT NULL DEFAULT 'pending';

ALTER TABLE leave_requests
  MODIFY COLUMN status ENUM(
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'withdrawn'
  ) NOT NULL DEFAULT 'pending';

ALTER TABLE overtime_requests
  MODIFY COLUMN status ENUM(
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'withdrawn'
  ) NOT NULL DEFAULT 'pending';
