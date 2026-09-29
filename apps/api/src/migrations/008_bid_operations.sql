ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'sourcing_user';
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';

UPDATE users
SET role = 'super_admin',
    display_name = CASE WHEN display_name = '' THEN 'Response Review Lead' ELSE display_name END
WHERE id = (SELECT MIN(id) FROM users);

CREATE TABLE IF NOT EXISTS bid_workflows (
  opportunity_id TEXT PRIMARY KEY,
  decision TEXT NOT NULL DEFAULT 'Pending review',
  decision_reason TEXT NOT NULL DEFAULT '',
  decision_notes TEXT NOT NULL DEFAULT '',
  required_resources_json TEXT NOT NULL DEFAULT '[]',
  sourcing_brief TEXT NOT NULL DEFAULT '',
  sourcing_status TEXT NOT NULL DEFAULT 'Not published',
  documentation_items_json TEXT NOT NULL DEFAULT '[]',
  documentation_notes TEXT NOT NULL DEFAULT '',
  response_status TEXT NOT NULL DEFAULT 'Not started',
  response_review_notes TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  current_title TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  years_experience INTEGER NOT NULL DEFAULT 0,
  availability TEXT NOT NULL DEFAULT '',
  skills_json TEXT NOT NULL DEFAULT '[]',
  qualification_summary TEXT NOT NULL DEFAULT '',
  profile_reference TEXT NOT NULL DEFAULT '',
  submitted_by INTEGER NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'New',
  review_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  FOREIGN KEY(submitted_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bid_workflows_decision ON bid_workflows(decision);
CREATE INDEX IF NOT EXISTS idx_bid_workflows_sourcing ON bid_workflows(sourcing_status);
CREATE INDEX IF NOT EXISTS idx_candidates_opportunity ON candidates(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(review_status);

INSERT OR IGNORE INTO bid_workflows (opportunity_id, created_at, updated_at)
SELECT id, last_updated_at, last_updated_at FROM opportunities;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_bid_workflow
AFTER INSERT ON opportunities
BEGIN
  INSERT OR IGNORE INTO bid_workflows (opportunity_id, created_at, updated_at)
  VALUES (NEW.id, NEW.last_updated_at, NEW.last_updated_at);
END;

UPDATE bid_workflows
SET decision = CASE
      WHEN opportunity_id IN (SELECT id FROM opportunities WHERE status IN ('Qualified', 'Pursuing', 'Preparing Response', 'Submitted', 'Awarded')) THEN 'Pursue'
      WHEN opportunity_id IN (SELECT id FROM opportunities WHERE status = 'No Bid') THEN 'No bid'
      ELSE decision
    END,
    sourcing_status = CASE
      WHEN opportunity_id IN (SELECT id FROM opportunities WHERE status IN ('Qualified', 'Pursuing', 'Preparing Response')) THEN 'Open'
      ELSE sourcing_status
    END;

DROP TABLE IF EXISTS automation_pipelines;
