UPDATE opportunities
SET status = CASE
  WHEN status = 'Submitted' THEN 'Submitted'
  WHEN status IN ('No Bid', 'Lost', 'Closed', 'Archived') THEN 'Not submitted'
  WHEN status IN ('Qualified', 'Pursuing', 'Preparing Response', 'Awarded') THEN 'Qualified'
  ELSE 'Not reviewed'
END;

UPDATE bid_workflows
SET decision = CASE
  WHEN decision = 'Pursue' THEN 'Qualified'
  WHEN decision = 'No bid' THEN 'Not qualified'
  ELSE 'Not reviewed'
END;

DROP TRIGGER IF EXISTS trg_opportunity_bid_workflow;

CREATE TRIGGER trg_opportunity_bid_workflow
AFTER INSERT ON opportunities
BEGIN
  INSERT OR IGNORE INTO bid_workflows (opportunity_id, decision, created_at, updated_at)
  VALUES (NEW.id, 'Not reviewed', NEW.last_updated_at, NEW.last_updated_at);
END;
