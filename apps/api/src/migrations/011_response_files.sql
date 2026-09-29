CREATE TABLE IF NOT EXISTS response_files (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  documentation_item_id TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Response attachment',
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by INTEGER NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'Pending review',
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  FOREIGN KEY(uploaded_by) REFERENCES users(id),
  FOREIGN KEY(reviewed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_response_files_opportunity
ON response_files(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_response_files_review_status
ON response_files(review_status);
