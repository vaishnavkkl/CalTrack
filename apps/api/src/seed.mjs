import { randomBytes, scryptSync } from 'node:crypto';
import { config } from './config.mjs';
import { db, migrate } from './database.mjs';
import { seedPortals } from './seed-data.mjs';
import { DEFAULT_EXCLUDED_KEYWORDS, DEFAULT_IT_KEYWORDS } from './relevance.mjs';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function seed() {
  migrate();
  const now = new Date().toISOString();
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    const { salt, hash } = hashPassword(config.adminPassword);
    db.prepare(`INSERT INTO users (username, email, password_hash, password_salt, role, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'super_admin', 'Bid Manager', ?, ?)`).run(
      config.adminUsername.toLowerCase(), config.adminEmail.toLowerCase(), hash, salt, now, now);
  }
  if (!config.production) {
    const demoUsers = [
      ['superadmin', 'owner@caltrack.local', 'superadmin123', 'super_admin', 'Bid Manager'],
      ['admin', 'review@caltrack.local', 'admin123', 'super_admin', 'Bid Manager'],
      ['user', 'sourcing@caltrack.local', 'user123', 'sourcing_user', 'Candidate Sourcing Team']
    ];
    const upsertUser = db.prepare(`INSERT INTO users
      (username, email, password_hash, password_salt, role, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET username = excluded.username,
        password_hash = excluded.password_hash, password_salt = excluded.password_salt,
        role = excluded.role, display_name = excluded.display_name, updated_at = excluded.updated_at`);
    for (const [username, email, password, role, displayName] of demoUsers) {
      const { salt, hash } = hashPassword(password);
      upsertUser.run(username, email, hash, salt, role, displayName, now, now);
    }
  }

  const insertPortal = db.prepare(`INSERT OR IGNORE INTO portals
    (id, name, portal_type, base_url, connector_key, provider, organization_name, account_scope,
      opportunity_group, auth_mode, enabled, is_primary, cadence, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const portal of seedPortals) {
    insertPortal.run(portal.id, portal.name, portal.portalType, portal.baseUrl, portal.connectorKey,
      portal.provider, portal.organizationName, portal.accountScope, portal.opportunityGroup,
      portal.authMode, portal.enabled, portal.isPrimary, portal.cadence, portal.status, now, now);
  }

  const defaults = {
    includedKeywords: DEFAULT_IT_KEYWORDS,
    excludedKeywords: DEFAULT_EXCLUDED_KEYWORDS,
    preferredAgencies: ['California Department of Technology', 'County of Los Angeles'],
    collectionFrequency: 'daily',
    emailDigest: false,
    deadlineAlerts: true
  };
  const currentSettings = db.prepare(`SELECT value_json FROM settings WHERE key = 'application'`).get();
  let mergedSettings = defaults;
  if (currentSettings) {
    try {
      const current = JSON.parse(currentSettings.value_json);
      mergedSettings = {
        ...defaults,
        ...current,
        includedKeywords: Array.from(new Set([...DEFAULT_IT_KEYWORDS, ...(current.includedKeywords || [])])),
        excludedKeywords: Array.from(new Set([...DEFAULT_EXCLUDED_KEYWORDS, ...(current.excludedKeywords || [])]))
      };
    } catch {
      mergedSettings = defaults;
    }
  }
  db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES ('application', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
    .run(JSON.stringify(mergedSettings), now);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  seed();
  console.log(`CalTrack seed complete: ${config.dbPath}`);
}
