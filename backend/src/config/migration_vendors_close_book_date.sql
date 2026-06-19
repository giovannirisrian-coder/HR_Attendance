-- Vendor close-book date: 1–27 = day of month, 28 = end of month
ALTER TABLE vendors
  ADD COLUMN close_book_date TINYINT UNSIGNED NOT NULL DEFAULT 1
    COMMENT '1–27: close on day N; 28: end of month'
    AFTER is_active;
