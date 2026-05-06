-- ============================================================
-- Berau Coal – Digital Attendance System Database Schema
-- Workflow: LS → LS Supervisor → Vendor → LS HR → SSU
-- ============================================================

CREATE DATABASE IF NOT EXISTS beraucoal_attendance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE beraucoal_attendance;

-- ──────────────────────────────────────────────
-- 1. VENDORS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  address     TEXT,
  phone       VARCHAR(30),
  email       VARCHAR(150),
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 2. USERS
-- roles: ls | ls_supervisor | vendor | ls_hr | ssu
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  employee_id     VARCHAR(50)  UNIQUE,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password        VARCHAR(255) NOT NULL,
  role            ENUM('ls','ls_supervisor','vendor','ls_hr','ssu') NOT NULL,
  vendor_id       INT          NULL,
  supervisor_id   INT          NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_vendor     FOREIGN KEY (vendor_id)    REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_supervisor FOREIGN KEY (supervisor_id) REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 2b. EMPLOYEES (master NIK; satu user dapat punya satu profil karyawan)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL UNIQUE,
  nik             VARCHAR(16)  NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_emp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 3. ATTENDANCE
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  employee_id     INT          NOT NULL,
  nik             VARCHAR(16)  NULL,
  attendance_date DATE         NOT NULL,
  clock_in_time   TIME         NULL,
  clock_in_lat    DECIMAL(10,8) NULL,
  clock_in_lng    DECIMAL(11,8) NULL,
  clock_in_address TEXT         NULL,
  clock_out_time  TIME         NULL,
  clock_out_lat   DECIMAL(10,8) NULL,
  clock_out_lng   DECIMAL(11,8) NULL,
  clock_out_address TEXT        NULL,
  ot_start_time   TIME         NULL,
  ot_end_time     TIME         NULL,
  ot_summary      TEXT         NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by     INT          NULL,
  approved_at     TIMESTAMP    NULL,
  rejection_note  TEXT         NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_date (user_id, attendance_date),
  CONSTRAINT fk_att_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT fk_att_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 4. LEAVE REQUESTS (Cuti | Izin | Sakit) — LS → LS Supervisor
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  request_type    ENUM('cuti','izin','sakit') NOT NULL,
  start_date      DATE         NOT NULL,
  end_date        DATE         NOT NULL,
  reason          TEXT         NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by     INT          NULL,
  approved_at     TIMESTAMP    NULL,
  rejection_note  TEXT         NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_lr_user_type (user_id, request_type),
  KEY idx_lr_status (status),
  CONSTRAINT fk_lr_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 5. VENDOR MONTHLY SUBMISSIONS (Vendor → LS HR → SSU)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_monthly_submissions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id           INT          NOT NULL,
  report_month        TINYINT      NOT NULL,
  report_year         INT          NOT NULL,
  invoice_value       DECIMAL(18,2) NULL,
  invoice_number      VARCHAR(128) NULL,
  invoice_date        DATE         NULL,
  due_days            VARCHAR(32)  NULL,
  invoice_line_items  JSON         NULL,
  pph_amount          DECIMAL(18,2) NULL,
  bast_file           VARCHAR(255) NULL,
  invoice_file        VARCHAR(255) NULL,
  recap_salary_file   VARCHAR(255) NULL,
  tax_file            VARCHAR(255) NULL,
  receipt_file        VARCHAR(255) NULL,
  other_supporting_files JSON      NULL,
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

-- ──────────────────────────────────────────────
-- 6. GLOG MACHINE IMPORT (raw staging → 1 baris/hari: min jam = masuk, max jam = pulang)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS glog_import_batches (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  uploaded_by       INT          NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_ext          VARCHAR(10)  NOT NULL,
  staging_row_count INT          NOT NULL DEFAULT 0,
  staging_error_count INT        NOT NULL DEFAULT 0,
  status            ENUM('staged','processed') NOT NULL DEFAULT 'staged',
  processed_at      TIMESTAMP    NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_glog_batch_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS glog_import_staging (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id         INT          NOT NULL,
  line_no          INT          NOT NULL,
  nik              VARCHAR(32)  NOT NULL,
  employee_name    VARCHAR(255) NOT NULL,
  tanggal_raw      VARCHAR(32)  NULL,
  jam_raw          VARCHAR(32)  NULL,
  machine_name     VARCHAR(255) NULL,
  attendance_date  DATE         NULL,
  event_time       TIME         NULL,
  parse_error      VARCHAR(500) NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_glog_staging_batch (batch_id),
  KEY idx_glog_staging_batch_parse (batch_id, parse_error),
  CONSTRAINT fk_glog_staging_batch FOREIGN KEY (batch_id) REFERENCES glog_import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS glog_import_daily (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id         INT          NOT NULL,
  nik              VARCHAR(32)  NOT NULL,
  employee_name    VARCHAR(255) NOT NULL,
  attendance_date  DATE         NOT NULL,
  time_in          TIME         NOT NULL,
  time_out         TIME         NOT NULL,
  tap_count        INT          NOT NULL DEFAULT 0,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_glog_daily_batch_nik_date (batch_id, nik, attendance_date),
  KEY idx_glog_daily_batch (batch_id),
  CONSTRAINT fk_glog_daily_batch FOREIGN KEY (batch_id) REFERENCES glog_import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 7. SEED DATA (password for all demo users: "password")
-- bcrypt hash below matches Laravel's default "password" example
-- ──────────────────────────────────────────────
INSERT IGNORE INTO vendors (name, code, address, phone, email) VALUES
  ('PT Mitra Karya Utama', 'MKU001', 'Jl. Pertambangan No. 1, Berau', '0551-1234567', 'mku@vendor.com'),
  ('CV Sumber Daya Mandiri', 'SDM002', 'Jl. Industri No. 5, Berau',   '0551-7654321', 'sdm@vendor.com');

INSERT IGNORE INTO users (name, employee_id, email, password, role, vendor_id, supervisor_id) VALUES
  ('Admin MKU',  'VND001', 'vendor1@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'vendor', 1, NULL),
  ('Admin SDM',  'VND002', 'vendor2@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'vendor', 2, NULL),
  ('Budi Santoso',  'SPV001', 'supervisor1@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls_supervisor', 1, NULL),
  ('Dewi Rahayu',   'SPV002', 'supervisor2@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls_supervisor', 2, NULL),
  ('Ahmad Fauzi',   'LS001', 'ls1@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls', 1, NULL),
  ('Siti Nurhaliza','LS002', 'ls2@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls', 1, NULL),
  ('Rudi Hartono',  'LS003', 'ls3@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls', 2, NULL),
  ('LS HR Officer', 'HR001', 'lshr@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls_hr', NULL, NULL),
  ('SSU Officer',   'SSU001', 'ssu@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ssu', NULL, NULL);

UPDATE users SET supervisor_id = (SELECT id FROM (SELECT id FROM users WHERE employee_id='SPV001') t) WHERE employee_id IN ('LS001','LS002');
UPDATE users SET supervisor_id = (SELECT id FROM (SELECT id FROM users WHERE employee_id='SPV002') t) WHERE employee_id = 'LS003';

-- Master karyawan (NIK) untuk user LS — wajib sebelum absensi
INSERT INTO employees (user_id, nik)
SELECT u.id,
  CASE u.employee_id
    WHEN 'LS001' THEN '3173010101010001'
    WHEN 'LS002' THEN '3173020202020002'
    WHEN 'LS003' THEN '3173030303030003'
    ELSE '0000000000000001'
  END
FROM users u
WHERE u.role = 'ls'
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id);
