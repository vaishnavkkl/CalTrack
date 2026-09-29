ALTER TABLE opportunities ADD COLUMN source_group TEXT NOT NULL DEFAULT 'priority';

UPDATE opportunities
SET source_group = CASE
  WHEN lower(source_portal) = 'cal eprocure' THEN 'caleprocure'
  ELSE 'priority'
END;

CREATE INDEX IF NOT EXISTS idx_opportunities_source_group
ON opportunities(source_group);

ALTER TABLE portals ADD COLUMN provider TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE portals ADD COLUMN organization_name TEXT;
ALTER TABLE portals ADD COLUMN account_scope TEXT NOT NULL DEFAULT 'agency';
ALTER TABLE portals ADD COLUMN opportunity_group TEXT NOT NULL DEFAULT 'priority';
ALTER TABLE portals ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'public';

UPDATE portals
SET provider = CASE
      WHEN id = 'caleprocure' THEN 'caleprocure'
      WHEN id = 'opengov-ca' THEN 'opengov'
      WHEN id = 'bonfire-ca' THEN 'bonfire'
      ELSE provider
    END,
    organization_name = COALESCE(organization_name, name),
    account_scope = CASE
      WHEN id = 'caleprocure' THEN 'statewide'
      WHEN id = 'opengov-ca' THEN 'network'
      ELSE 'agency'
    END,
    opportunity_group = CASE
      WHEN id = 'caleprocure' THEN 'caleprocure'
      ELSE 'priority'
    END;

CREATE TABLE IF NOT EXISTS automation_pipelines (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger_type TEXT NOT NULL DEFAULT 'Schedule',
  schedule TEXT NOT NULL DEFAULT 'Daily at 6:00 AM Pacific',
  source_group TEXT NOT NULL DEFAULT 'priority',
  enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  node_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_run_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(external_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_pipelines_status
ON automation_pipelines(status);
