-- ============================================================
-- LS HR ➜ Employee List (BAST Check master data)
-- Adds a dedicated table for LS HR-managed vendor employee
-- records. ISOLATED from the existing `employees` table that
-- backs `attendance.employee_id`; the established workflow
-- (LS → Supervisor → Vendor → LS HR → SSU) is preserved.
-- Run after schema.sql; safe to re-run (IF NOT EXISTS).
-- ============================================================

USE beraucoal_attendance;

CREATE TABLE IF NOT EXISTS hr_employees (
  id                INT AUTO_INCREMENT PRIMARY KEY,

  -- Vendor / contract
  vendor_number     VARCHAR(64)   NOT NULL,
  user_department   VARCHAR(150)  NOT NULL,
  department_title  VARCHAR(150)  NOT NULL,
  vendor_name       VARCHAR(200)  NOT NULL,
  employment_status ENUM('Permanent','Contract') NOT NULL,
  po_number         VARCHAR(64)   NOT NULL,
  po_period_1       DATE          NOT NULL,
  po_period_2       DATE          NOT NULL,
  dic_hro           VARCHAR(150)  NOT NULL,
  cost_center       VARCHAR(64)   NOT NULL,

  -- Personal identity
  npk               VARCHAR(64)   NOT NULL,
  employee_name     VARCHAR(200)  NOT NULL,
  position          VARCHAR(150)  NOT NULL,
  position_group    VARCHAR(150)  NOT NULL,
  category          VARCHAR(100)  NOT NULL,
  site              VARCHAR(100)  NOT NULL,

  -- Supervisor
  supervisor_nik    VARCHAR(64)   NOT NULL,
  supervisor_name   VARCHAR(200)  NOT NULL,

  -- Administrative status
  user_status       ENUM('Active','Deactive') NOT NULL DEFAULT 'Active',

  -- Audit
  created_by        INT           NULL,
  updated_by        INT           NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Constraints / indexes
  UNIQUE KEY uq_hr_employees_npk (npk),
  KEY idx_hr_employees_employee_name (employee_name),
  KEY idx_hr_employees_vendor_name (vendor_name),
  KEY idx_hr_employees_supervisor_name (supervisor_name),
  KEY idx_hr_employees_site (site),
  KEY idx_hr_employees_user_status (user_status),

  CONSTRAINT fk_hr_employees_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_hr_employees_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_hr_employees_po_period CHECK (po_period_2 >= po_period_1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Optional seed (only inserted when the table is empty) ────
-- Mirrors the same realistic mock used by the LS HR Employee
-- List page so QA/UAT users see populated data immediately.
INSERT INTO hr_employees (
  vendor_number, user_department, department_title, vendor_name,
  employment_status, po_number, po_period_1, po_period_2, dic_hro, cost_center,
  npk, employee_name, position, position_group, category, site,
  supervisor_nik, supervisor_name, user_status
)
SELECT * FROM (
  SELECT 'V-001234','Mining Operation','Production','PT Karya Tambang Sejahtera','Permanent','PO-2026-00112','2026-01-01','2026-12-31','Andi Pratama','CC-3001','NPK-100245','Budi Santoso','Heavy Equipment Operator','Operator','Field','Lati','880123','Rian Hidayat','Active' UNION ALL
  SELECT 'V-001234','Mining Operation','Production','PT Karya Tambang Sejahtera','Contract','PO-2026-00112','2026-01-01','2026-12-31','Andi Pratama','CC-3001','NPK-100312','Siti Aminah','Mining Foreman','Supervisor','Field','Lati','880123','Rian Hidayat','Active' UNION ALL
  SELECT 'V-002981','Plant Maintenance','Maintenance','PT Mitra Alat Berat','Permanent','PO-2026-00208','2026-02-01','2027-01-31','Lina Marlina','CC-4012','NPK-200118','Hendra Wijaya','Mechanic Senior','Senior Staff','Workshop','Sambarata','870456','Yusuf Maulana','Active' UNION ALL
  SELECT 'V-002981','Plant Maintenance','Maintenance','PT Mitra Alat Berat','Contract','PO-2026-00208','2026-02-01','2027-01-31','Lina Marlina','CC-4012','NPK-200145','Joko Susilo','Welder','Operator','Workshop','Sambarata','870456','Yusuf Maulana','Deactive' UNION ALL
  SELECT 'V-003457','HSE','Safety & Environment','PT Sinergi Karya Utama','Permanent','PO-2026-00377','2026-03-15','2027-03-14','Dewi Lestari','CC-5005','NPK-300089','Rahmat Hidayat','HSE Officer','Staff','Office','Binungan','890234','Anita Kusuma','Active'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM hr_employees LIMIT 1);
