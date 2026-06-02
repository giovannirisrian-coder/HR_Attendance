-- PIN mesin Fingerspot → relasi ke employees.nik (mapping di sync att_log).
USE beraucoal_attendance;

ALTER TABLE employees
  ADD COLUMN pin VARCHAR(32) NULL AFTER nik,
  ADD KEY idx_employees_pin (pin);
