-- ============================================================
-- HR Employees — retire legacy `nik` column (refaktor nik → npk).
--
-- Background:
-- Berau Coal HR memutuskan untuk menyatukan identitas karyawan ke
-- satu kolom `npk` (Nomor Pokok Karyawan) sebagai pengidentifikasi
-- utama di seluruh alur kerja digital:
--   • Biometric Capture (Glog Machine Import)
--   • Cloud Synchronization (LS HR Employee List ↔ users)
--   • Managerial Review (Supervisor approval queues)
--   • Automated Analytics (Monthly Attendance Sheet, BAST, Salary Recap)
--
-- Refaktor sebelumnya sudah mengganti seluruh referensi kolom
-- `hr_employees.nik` di backend (controllers, schema, seed) dan
-- frontend (Employee List, Attendance, Leave, Overtime, Supervisor
-- Approval) menjadi `hr_employees.npk`. Migrasi ini membersihkan sisa
-- kolom lama dari database:
--
--   1. Backfill: salin nilai `nik` ke `npk` untuk baris yang masih
--      menyimpan identitas pada kolom lama (npk IS NULL AND
--      nik IS NOT NULL). Konflik UNIQUE pada `uq_hr_employees_npk`
--      tetap diberlakukan — jika pasangan (nik, npk) yang sudah ada
--      bentrok, sesuaikan data manual sebelum migrasi ini dijalankan.
--   2. Drop index `idx_hr_employees_nik`.
--   3. Drop column `hr_employees.nik`.
--
-- Workflow impact: NONE.
-- The end-to-end approval chain (Employee → Leader Employee → Vendor
-- → PIC LS → SSU) dan analytics tetap berfungsi karena seluruh query
-- sudah membaca `hr_employees.npk`.
--
-- Safe to re-run:
--   Setiap langkah diguard via INFORMATION_SCHEMA / kondisi WHERE,
--   sehingga eksekusi ulang pada skema yang sudah dimigrasi menjadi
--   no-op.
--
-- Prasyarat:
--   • Jalankan setelah `migration_attendance_widen_nik.sql` agar
--     `attendance.nik` cukup lebar menampung NPK.
--   • Pastikan kolom `npk` sudah tidak menyimpan nilai berbeda dari
--     `nik` untuk baris yang sama (mis. jika HR pernah mengisi
--     keduanya secara berbeda, putuskan dulu mana nilai kanonis).
-- ============================================================

USE beraucoal_attendance;

-- 1. Backfill npk ← nik (hanya jika npk masih kosong).
--    UPDATE ini idempotent: pada eksekusi berikutnya tidak ada baris
--    yang memenuhi predikat sehingga tidak ada perubahan.
SET @nik_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'nik'
);

SET @backfill_sql := IF(
  @nik_col_exists > 0,
  'UPDATE hr_employees
      SET npk = nik
    WHERE (npk IS NULL OR npk = '''')
      AND nik IS NOT NULL
      AND nik <> ''''',
  'DO 0'
);
PREPARE stmt FROM @backfill_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Drop the legacy index on `nik` if it still exists.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND INDEX_NAME   = 'idx_hr_employees_nik'
);

SET @drop_idx_sql := IF(
  @idx_exists > 0,
  'ALTER TABLE hr_employees DROP INDEX idx_hr_employees_nik',
  'DO 0'
);
PREPARE stmt FROM @drop_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Drop the legacy `nik` column.
SET @nik_col_still_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_employees'
    AND COLUMN_NAME  = 'nik'
);

SET @drop_col_sql := IF(
  @nik_col_still_exists > 0,
  'ALTER TABLE hr_employees DROP COLUMN nik',
  'DO 0'
);
PREPARE stmt FROM @drop_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
