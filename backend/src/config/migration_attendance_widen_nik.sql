-- ============================================================
-- Attendance — widen `attendance.nik` from VARCHAR(16) to VARCHAR(64).
--
-- Background:
-- Sebagai bagian dari refaktor identitas karyawan (nik → npk) pada
-- tabel `hr_employees`, kolom snapshot `attendance.nik` sekarang
-- menampung nilai NPK yang diambil dari `hr_employees.npk`. NPK pada
-- master data dapat mencapai 64 karakter (lihat
-- `MAX_LENGTHS.npk` di `hrEmployeeController.js`), jauh lebih panjang
-- dari batas 16 digit NIK lama.
--
-- Untuk menjaga alur Biometric Capture, Cloud Synchronization dan
-- Automated Analytics tetap berjalan tanpa truncation error, kolom
-- ini dilebarkan menjadi VARCHAR(64). Nilai eksisting (16-digit NIK)
-- tetap valid karena VARCHAR menyimpan string variabel-panjang.
--
-- Workflow impact: NONE.
-- The end-to-end approval chain (Employee → Leader Employee → Vendor
-- → PIC LS → SSU) dan struktur tabel lain tidak berubah; hanya tipe
-- kolom pada `attendance` yang diperluas agar muat NPK.
--
-- Safe to run multiple times:
--   The ALTER is guarded by an INFORMATION_SCHEMA lookup so the
--   MODIFY COLUMN is skipped on a schema that has already been
--   widened.
-- ============================================================

USE beraucoal_attendance;

SET @col_length := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'attendance'
    AND COLUMN_NAME  = 'nik'
);

SET @widen_sql := IF(
  @col_length IS NULL OR @col_length < 64,
  'ALTER TABLE attendance MODIFY COLUMN nik VARCHAR(64) NULL',
  'DO 0'
);
PREPARE stmt FROM @widen_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
