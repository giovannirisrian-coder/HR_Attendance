-- Employee replacement tracking (PIC LS / LS HR)
-- Links an active hr_employees row to the deactivated employee it replaces,
-- and logs each replacement event for BAST / Document Check audit trails.

USE beraucoal_attendance;

ALTER TABLE hr_employees
  ADD COLUMN replaces_employee_id INT NULL AFTER supervisor_id,
  ADD KEY idx_hr_employees_replaces_employee_id (replaces_employee_id),
  ADD CONSTRAINT fk_hr_employees_replaces_employee
    FOREIGN KEY (replaces_employee_id) REFERENCES hr_employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS employee_replacement_logs (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  previous_employee     VARCHAR(200) NOT NULL COMMENT 'Name of deactivated employee being replaced',
  replacement_employee  VARCHAR(200) NOT NULL COMMENT 'Name of new active employee (replacer)',
  created_by            VARCHAR(150) NULL COMMENT 'Display name of PIC LS who recorded the replacement',
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
