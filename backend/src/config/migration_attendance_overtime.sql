-- LS overtime: range time (start/end) + optional summary on attendance row.
-- Same approval status as attendance (supervisor PUT .../approval).

USE beraucoal_attendance;

ALTER TABLE attendance
  ADD COLUMN ot_start_time TIME NULL AFTER clock_out_address,
  ADD COLUMN ot_end_time   TIME NULL AFTER ot_start_time,
  ADD COLUMN ot_summary    TEXT NULL AFTER ot_end_time;
