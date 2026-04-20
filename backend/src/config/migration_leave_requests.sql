-- Leave requests: Cuti, Izin, Sakit (separate request_type per row).
-- If you ever had a legacy single-type leave table, migrate rows into
-- leave_requests with the correct request_type before dropping the old table.
-- This project ships with no prior leave table; existing DBs only need this DDL.

USE beraucoal_attendance;

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
