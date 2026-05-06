-- Vendor recap reporting: invoice header, line items, PPh, receipt, other attachments
ALTER TABLE vendor_monthly_submissions
  ADD COLUMN invoice_number VARCHAR(128) NULL AFTER invoice_value,
  ADD COLUMN invoice_date DATE NULL,
  ADD COLUMN due_days VARCHAR(32) NULL,
  ADD COLUMN invoice_line_items JSON NULL,
  ADD COLUMN pph_amount DECIMAL(18,2) NULL,
  ADD COLUMN receipt_file VARCHAR(255) NULL,
  ADD COLUMN other_supporting_files JSON NULL;
