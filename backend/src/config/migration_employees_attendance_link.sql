-- Employees master (NIK) + attendance.employee_id → employees.id
-- Run once. Requires table `attendance` (with or without column `nik`).
-- If `employee_id` already exists, skip this file.

USE beraucoal_attendance;

CREATE TABLE IF NOT EXISTS employees (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL UNIQUE,
  nik             VARCHAR(16)  NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_emp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO employees (user_id, nik)
SELECT u.id,
  COALESCE(
    (SELECT REPLACE(TRIM(a.nik), ' ', '') FROM attendance a
     WHERE a.user_id = u.id AND a.nik IS NOT NULL
       AND CHAR_LENGTH(REPLACE(TRIM(a.nik), ' ', '')) = 16
     ORDER BY a.updated_at DESC LIMIT 1),
    CASE u.employee_id
      WHEN 'LS001' THEN '3173010101010001'
      WHEN 'LS002' THEN '3173020202020002'
      WHEN 'LS003' THEN '3173030303030003'
      ELSE '0000000000000001'
    END
  )
FROM users u
WHERE u.role = 'ls'
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id);

INSERT INTO employees (user_id, nik)
SELECT DISTINCT u.id, '0000000000000999'
FROM users u
INNER JOIN attendance a ON a.user_id = u.id
WHERE u.role = 'ls'
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id);

ALTER TABLE attendance
  ADD COLUMN employee_id INT NULL AFTER user_id;

UPDATE attendance a
INNER JOIN employees e ON e.user_id = a.user_id
SET a.employee_id = e.id
WHERE a.employee_id IS NULL;

ALTER TABLE attendance
  MODIFY COLUMN employee_id INT NOT NULL,
  ADD CONSTRAINT fk_att_employee FOREIGN KEY (employee_id) REFERENCES employees(id);

UPDATE attendance a
INNER JOIN employees e ON e.id = a.employee_id
SET a.nik = e.nik;
