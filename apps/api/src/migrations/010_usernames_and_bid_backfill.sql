ALTER TABLE users ADD COLUMN username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
ON users(username) WHERE username IS NOT NULL;

UPDATE users SET username = 'superadmin'
WHERE id = (SELECT MIN(id) FROM users WHERE role = 'super_admin');

UPDATE users SET username = 'admin'
WHERE id = (SELECT MIN(id) FROM users WHERE role = 'admin');

UPDATE users SET username = 'user'
WHERE id = (SELECT MIN(id) FROM users WHERE role = 'sourcing_user');

INSERT OR IGNORE INTO bid_workflows (opportunity_id, created_at, updated_at)
SELECT id, last_updated_at, last_updated_at
FROM opportunities;

DROP TRIGGER IF EXISTS trg_opportunity_bid_workflow;

CREATE TRIGGER trg_opportunity_bid_workflow
AFTER INSERT ON opportunities
BEGIN
  INSERT OR IGNORE INTO bid_workflows (opportunity_id, created_at, updated_at)
  VALUES (NEW.id, NEW.last_updated_at, NEW.last_updated_at);
END;
