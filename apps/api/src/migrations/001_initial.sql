PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  solicitation_number TEXT,
  solicitation_type TEXT NOT NULL DEFAULT 'RFP',
  title TEXT NOT NULL,
  agency TEXT NOT NULL,
  department TEXT,
  description TEXT,
  category TEXT NOT NULL,
  published_at TEXT,
  closes_at TEXT,
  location TEXT NOT NULL DEFAULT 'California',
  contact_name TEXT,
  contact_email TEXT,
  source_portal TEXT NOT NULL,
  source_url TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'New',
  relevance_score INTEGER NOT NULL DEFAULT 0,
  reviewed INTEGER NOT NULL DEFAULT 0,
  saved INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  first_collected_at TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  last_updated_at TEXT NOT NULL,
  source_status TEXT NOT NULL DEFAULT 'Open',
  UNIQUE(source_portal, solicitation_number)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_closes ON opportunities(closes_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_agency ON opportunities(agency);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);

CREATE TABLE IF NOT EXISTS portals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  portal_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  connector_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  cadence TEXT NOT NULL DEFAULT 'Daily · 6:00 AM',
  status TEXT NOT NULL DEFAULT 'Healthy',
  last_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_jobs (
  id TEXT PRIMARY KEY,
  portal_id TEXT NOT NULL,
  portal_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  found_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  FOREIGN KEY(portal_id) REFERENCES portals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
