-- Vendor submission file columns: store GCS refs as JSON {path,name} (may exceed VARCHAR(255))
ALTER TABLE vendor_monthly_submissions
  MODIFY COLUMN tax_file TEXT NULL,
  MODIFY COLUMN invoice_file TEXT NULL,
  MODIFY COLUMN receipt_file TEXT NULL,
  MODIFY COLUMN bast_file TEXT NULL,
  MODIFY COLUMN recap_salary_file TEXT NULL;
