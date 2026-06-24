-- ============================================================
-- LS HR ➜ Employee Group master data
--
-- Replaces the legacy ENUM('BC','MTL') on hr_employees.employee_group
-- with a normalized employee_group lookup table and an
-- hr_employees.employee_group_id FK so PIC LS can manage groups
-- centrally via the Master Data module.
--
-- Workflow impact: NONE — only how the group value is stored.
-- ============================================================

USE beraucoal_attendance;

DROP PROCEDURE IF EXISTS employee_group_migrate;
DELIMITER //
CREATE PROCEDURE employee_group_migrate()
BEGIN
  -- 1. Master table
  CREATE TABLE IF NOT EXISTS employee_group (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    employee_group VARCHAR(150) NOT NULL,
    created_by     VARCHAR(150) NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_employee_group_name (employee_group)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- 2. Seed legacy enum values so existing rows can be backfilled
  INSERT IGNORE INTO employee_group (employee_group) VALUES ('BC'), ('MTL');

  -- 3. Add FK column on hr_employees (if missing)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND COLUMN_NAME  = 'employee_group_id'
  ) THEN
    ALTER TABLE hr_employees
      ADD COLUMN employee_group_id INT NULL AFTER position_group;
  END IF;

  -- 4. Backfill from legacy ENUM column when it still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND COLUMN_NAME  = 'employee_group'
      AND DATA_TYPE    = 'enum'
  ) THEN
    UPDATE hr_employees h
      JOIN employee_group eg ON eg.employee_group = h.employee_group
       SET h.employee_group_id = eg.id
     WHERE h.employee_group IS NOT NULL
       AND h.employee_group_id IS NULL;
  END IF;

  -- 5. Drop legacy ENUM column
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND COLUMN_NAME  = 'employee_group'
  ) THEN
    ALTER TABLE hr_employees DROP COLUMN employee_group;
  END IF;

  -- 6. Index + FK (add only when missing)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_employees'
      AND INDEX_NAME   = 'idx_hr_employees_employee_group_id'
  ) THEN
    ALTER TABLE hr_employees
      ADD KEY idx_hr_employees_employee_group_id (employee_group_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME       = 'hr_employees'
      AND CONSTRAINT_NAME  = 'fk_hr_employees_employee_group'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE hr_employees
      ADD CONSTRAINT fk_hr_employees_employee_group
        FOREIGN KEY (employee_group_id) REFERENCES employee_group(id) ON DELETE SET NULL;
  END IF;
END //
DELIMITER ;

CALL employee_group_migrate();

DROP PROCEDURE IF EXISTS employee_group_migrate;
