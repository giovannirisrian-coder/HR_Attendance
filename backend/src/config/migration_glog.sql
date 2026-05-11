-- Jalankan pada database yang sudah ada (tanpa drop schema penuh).
-- Sinkron glog → attendance (di aplikasi) memakai REGEXP_REPLACE untuk opsi cocokkan NIK per digit; butuh MySQL 8+.
USE beraucoal_attendance;

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
