-- Allow LS correction workflow to submit multiple attendance requests per date.
-- Safe to run multiple times.
SET @user_idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance'
    AND index_name = 'idx_att_user_id'
);

SET @add_user_idx_sql := IF(
  @user_idx_exists = 0,
  'ALTER TABLE attendance ADD INDEX idx_att_user_id (user_id)',
  'SELECT "idx_att_user_id already exists"'
);

PREPARE stmt_add_user_idx FROM @add_user_idx_sql;
EXECUTE stmt_add_user_idx;
DEALLOCATE PREPARE stmt_add_user_idx;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance'
    AND index_name = 'uq_user_date'
);

SET @drop_sql := IF(
  @idx_exists > 0,
  'ALTER TABLE attendance DROP INDEX uq_user_date',
  'SELECT "uq_user_date already removed"'
);

PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
