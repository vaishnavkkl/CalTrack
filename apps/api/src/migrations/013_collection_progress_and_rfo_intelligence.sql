ALTER TABLE collection_jobs ADD COLUMN progress_stage TEXT NOT NULL DEFAULT 'Queued';
ALTER TABLE collection_jobs ADD COLUMN progress_current INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collection_jobs ADD COLUMN progress_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bid_workflows ADD COLUMN ua_required TEXT NOT NULL DEFAULT '';
ALTER TABLE bid_workflows ADD COLUMN candidates_required INTEGER;
ALTER TABLE bid_workflows ADD COLUMN candidates_provided INTEGER;
ALTER TABLE bid_workflows ADD COLUMN contract_term TEXT NOT NULL DEFAULT '';
ALTER TABLE bid_workflows ADD COLUMN budget TEXT NOT NULL DEFAULT '';
ALTER TABLE bid_workflows ADD COLUMN contract_mode TEXT NOT NULL DEFAULT '';
