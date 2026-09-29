ALTER TABLE opportunities ADD COLUMN owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal';
ALTER TABLE opportunities ADD COLUMN next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN next_action_due_at TEXT;

UPDATE opportunities
SET status = CASE status
  WHEN 'Reviewing' THEN 'Triage'
  WHEN 'Relevant' THEN 'Qualified'
  WHEN 'Not Relevant' THEN 'No Bid'
  ELSE status
END;
