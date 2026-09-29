DELETE FROM opportunities
WHERE lower(category) = 'hardware'
   OR lower(title || ' ' || description) LIKE '%hardware%'
   OR lower(title || ' ' || description) LIKE '%network switch%'
   OR lower(title || ' ' || description) LIKE '%wireless access point%'
   OR lower(title || ' ' || description) LIKE '%computer equipment%'
   OR lower(title || ' ' || description) LIKE '%server equipment%'
   OR lower(title || ' ' || description) LIKE '%equipment refresh%'
   OR lower(title || ' ' || description) LIKE '%device refresh%';

UPDATE opportunities
SET status = 'Closed',
    source_status = 'Closed',
    last_updated_at = datetime('now')
WHERE closes_at IS NOT NULL
  AND datetime(closes_at) <= datetime('now');
