-- Older demo records stored filenames without usable source URLs.
-- Keep only document records that carry their own source URL.
UPDATE opportunities
SET attachments_json = '[]'
WHERE attachments_json LIKE '["%';
