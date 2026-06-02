-- ============================================================
-- Decoupled Overtime workflow (LS → LS Supervisor)
--
-- Independent record store so Overtime no longer rides on the
-- attendance row. The legacy attendance.ot_* columns remain to
-- preserve the Vendor / LS HR / SSU "Automated Analytics" path:
-- when a Supervisor approves an Overtime request we link it to
-- the latest approved attendance row for that LS+date and copy
-- start/end/summary into that row so existing Monthly Sheet and
-- BAST aggregations keep working unchanged.
--
-- Sequential approval chain (LS → Supervisor → Vendor → LS HR →
-- SSU) is intentionally preserved: only the SUBMISSION container
-- moves out of /attendance/overtime into /overtimes.
-- Safe to run multiple times.
-- ============================================================

USE beraucoal_attendance;

CREATE TABLE IF NOT EXISTS overtime_requests (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  user_id              INT          NOT NULL,
  request_date         DATE         NOT NULL,
  start_time           TIME         NOT NULL,
  end_time             TIME         NOT NULL,
  remarks              TEXT         NULL,
  status               ENUM('pending','approved','rejected','cancelled','withdrawn') NOT NULL DEFAULT 'pending',
  approved_by          INT          NULL,
  approved_at          TIMESTAMP    NULL,
  rejection_note       TEXT         NULL,
  linked_attendance_id INT          NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_or_user_date (user_id, request_date),
  KEY idx_or_status (status),
  KEY idx_or_linked (linked_attendance_id),
  CONSTRAINT fk_or_user       FOREIGN KEY (user_id)              REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_or_approver   FOREIGN KEY (approved_by)          REFERENCES users(id)      ON DELETE SET NULL,
  CONSTRAINT fk_or_attendance FOREIGN KEY (linked_attendance_id) REFERENCES attendance(id) ON DELETE SET NULL
) ENGINE=InnoDB;
