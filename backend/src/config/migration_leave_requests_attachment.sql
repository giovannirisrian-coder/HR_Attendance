-- Leave request supporting documents (stored in Google Cloud Storage)
ALTER TABLE leave_requests
  ADD COLUMN attachment_gcs_path VARCHAR(512) NULL AFTER reason,
  ADD COLUMN attachment_original_name VARCHAR(255) NULL AFTER attachment_gcs_path;
