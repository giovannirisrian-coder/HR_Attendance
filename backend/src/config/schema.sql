-- ============================================================
-- Berau Coal – Digital Attendance System Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS beraucoal_attendance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE beraucoal_attendance;

-- ──────────────────────────────────────────────
-- 1. VENDORS  (must exist before users)
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
-- 2. USERS  (roles: ls | ls_supervisor | vendor)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  employee_id     VARCHAR(50)  UNIQUE,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password        VARCHAR(255) NOT NULL,
  role            ENUM('ls','ls_supervisor','vendor') NOT NULL,
  vendor_id       INT          NULL,               -- only for vendor & ls roles
  supervisor_id   INT          NULL,               -- ls -> their supervisor
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_vendor     FOREIGN KEY (vendor_id)    REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_supervisor FOREIGN KEY (supervisor_id) REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 3. ATTENDANCE
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  attendance_date DATE         NOT NULL,

  -- Clock-in
  clock_in_time   TIME         NULL,
  clock_in_lat    DECIMAL(10,8) NULL,
  clock_in_lng    DECIMAL(11,8) NULL,
  clock_in_address TEXT         NULL,

  -- Clock-out
  clock_out_time  TIME         NULL,
  clock_out_lat   DECIMAL(10,8) NULL,
  clock_out_lng   DECIMAL(11,8) NULL,
  clock_out_address TEXT        NULL,

  -- Approval workflow
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by     INT          NULL,
  approved_at     TIMESTAMP    NULL,
  rejection_note  TEXT         NULL,

  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_user_date (user_id, attendance_date),
  CONSTRAINT fk_att_user     FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 4. MONTHLY VENDOR REPORTS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_reports (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id       INT          NOT NULL,
  user_id         INT          NOT NULL,   -- the LS this report covers
  report_month    TINYINT      NOT NULL,   -- 1-12
  report_year     INT          NOT NULL,
  invoice_value   DECIMAL(18,2) NULL,

  -- Uploaded documents (relative paths inside /uploads/documents/)
  bast_file       VARCHAR(255) NULL,
  invoice_file    VARCHAR(255) NULL,
  recap_salary_file VARCHAR(255) NULL,
  tax_file        VARCHAR(255) NULL,

  submitted_by    INT          NULL,
  submitted_at    TIMESTAMP    NULL,
  status          ENUM('draft','submitted') NOT NULL DEFAULT 'draft',

  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_report (vendor_id, user_id, report_month, report_year),
  CONSTRAINT fk_rep_vendor    FOREIGN KEY (vendor_id)    REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_user      FOREIGN KEY (user_id)      REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_rep_submitted FOREIGN KEY (submitted_by) REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────
-- 5. SEED DATA – demo accounts
-- ──────────────────────────────────────────────
INSERT IGNORE INTO vendors (name, code, address, phone, email) VALUES
  ('PT Mitra Karya Utama', 'MKU001', 'Jl. Pertambangan No. 1, Berau', '0551-1234567', 'mku@vendor.com'),
  ('CV Sumber Daya Mandiri', 'SDM002', 'Jl. Industri No. 5, Berau',   '0551-7654321', 'sdm@vendor.com');

-- Passwords are bcrypt hash of "Password123!" (cost 10)
INSERT IGNORE INTO users (name, employee_id, email, password, role, vendor_id, supervisor_id) VALUES
  -- Vendor accounts
  ('Admin MKU',  'VND001', 'vendor1@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'vendor', 1, NULL),
  ('Admin SDM',  'VND002', 'vendor2@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'vendor', 2, NULL),
  -- LS Supervisors
  ('Budi Santoso',  'SPV001', 'supervisor1@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls_supervisor', 1, NULL),
  ('Dewi Rahayu',   'SPV002', 'supervisor2@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls_supervisor', 2, NULL),
  -- LS Employees (supervisor_id filled after supervisors are inserted)
  ('Ahmad Fauzi',   'LS001', 'ls1@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls', 1, NULL),
  ('Siti Nurhaliza','LS002', 'ls2@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls', 1, NULL),
  ('Rudi Hartono',  'LS003', 'ls3@beraucoal.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ls', 2, NULL);

-- Assign supervisors to LS employees
UPDATE users SET supervisor_id = (SELECT id FROM (SELECT id FROM users WHERE employee_id='SPV001') t) WHERE employee_id IN ('LS001','LS002');
UPDATE users SET supervisor_id = (SELECT id FROM (SELECT id FROM users WHERE employee_id='SPV002') t) WHERE employee_id = 'LS003';
