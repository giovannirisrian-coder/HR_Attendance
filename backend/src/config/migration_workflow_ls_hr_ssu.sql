-- Run on existing databases that already have the older schema.
-- Adjust database name if needed.

USE beraucoal_attendance;

-- Expand user roles
ALTER TABLE users
  MODIFY COLUMN role ENUM('ls','ls_supervisor','vendor','ls_hr','ssu') NOT NULL;

-- Vendor monthly workflow (replaces per-LS monthly_reports usage in the app)
CREATE TABLE IF NOT EXISTS vendor_monthly_submissions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id           INT          NOT NULL,
  report_month        TINYINT      NOT NULL,
  report_year         INT          NOT NULL,
  invoice_value       DECIMAL(18,2) NULL,
  bast_file           VARCHAR(255) NULL,
  invoice_file        VARCHAR(255) NULL,
  recap_salary_file   VARCHAR(255) NULL,
  tax_file            VARCHAR(255) NULL,
  submitted_by        INT          NULL,
  submitted_at        TIMESTAMP    NULL,
  workflow_status     ENUM(
    'draft',
    'pending_ls_hr',
    'hr_rejected',
    'pending_ssu',
    'invoice_on_process',
    'paid'
  ) NOT NULL DEFAULT 'draft',
  hr_reviewed_by      INT          NULL,
  hr_reviewed_at      TIMESTAMP    NULL,
  hr_rejection_note   TEXT         NULL,
  ssu_reviewed_by     INT          NULL,
  ssu_reviewed_at     TIMESTAMP    NULL,
  ssu_rejection_note  TEXT         NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vendor_period (vendor_id, report_month, report_year),
  CONSTRAINT fk_vms_vendor   FOREIGN KEY (vendor_id)    REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_vms_submit   FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_vms_hr       FOREIGN KEY (hr_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_vms_ssu      FOREIGN KEY (ssu_reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO users (name, employee_id, email, password, role, vendor_id, supervisor_id) VALUES
  ('LS HR Officer', 'HR001', 'lshr@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls_hr', NULL, NULL),
  ('SSU Officer',   'SSU001', 'ssu@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ssu', NULL, NULL);
