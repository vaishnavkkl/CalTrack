-- Consolidate preparation and approval into one manager role for small teams.
-- Existing identities and their authored records are preserved.
UPDATE users SET role = 'super_admin', updated_at = datetime('now') WHERE role = 'admin';
