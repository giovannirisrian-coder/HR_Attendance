-- Add final "paid" stage for SSU completion flow on existing databases.
-- Run this migration once per database.

USE beraucoal_attendance;

ALTER TABLE vendor_monthly_submissions
  MODIFY COLUMN workflow_status ENUM(
    'draft',
    'pending_ls_hr',
    'hr_rejected',
    'pending_ssu',
    'invoice_on_process',
    'paid'
  ) NOT NULL DEFAULT 'draft';
