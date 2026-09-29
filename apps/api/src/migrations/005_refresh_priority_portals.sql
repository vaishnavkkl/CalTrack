UPDATE portals
SET name = 'EUNA Supplier Network',
    base_url = 'https://supplier.eunasolutions.com',
    organization_name = 'Registered EUNA agencies',
    portal_type = 'Agency registrations',
    updated_at = datetime('now')
WHERE id = 'bonfire-ca';

UPDATE portals
SET organization_name = 'Registered OpenGov agencies',
    account_scope = 'network',
    status = CASE WHEN enabled = 1 THEN 'Ready' ELSE status END,
    updated_at = datetime('now')
WHERE id = 'opengov-ca';
