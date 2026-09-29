import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const migrationsDir = new URL('./migrations/', import.meta.url);
  const applied = db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version);
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.includes(file)) continue;
    const sql = fs.readFileSync(new URL(file, migrationsDir), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function json(value, fallback = []) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function mapOpportunity(row) {
  if (!row) return null;
  const attachments = json(row.attachments_json).map((attachment) => {
    if (typeof attachment === 'string') {
      return { name: attachment, url: row.source_url || '' };
    }
    return {
      name: String(attachment?.name || 'Solicitation document'),
      url: String(attachment?.url || row.source_url || '')
    };
  }).filter((attachment) => attachment.url);
  return {
    id: row.id,
    solicitationNumber: row.solicitation_number,
    solicitationType: row.solicitation_type,
    title: row.title,
    agency: row.agency,
    department: row.department,
    description: row.description,
    category: row.category,
    publishedAt: row.published_at,
    closesAt: row.closes_at,
    location: row.location,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    sourcePortal: row.source_portal,
    sourceGroup: row.source_group || (row.source_portal === 'Cal eProcure' ? 'caleprocure' : 'priority'),
    sourceUrl: row.source_url,
    attachments,
    status: row.status,
    relevanceScore: row.relevance_score,
    reviewed: Boolean(row.reviewed),
    saved: Boolean(row.saved),
    archived: Boolean(row.archived),
    notes: row.notes,
    ownerName: row.owner_name || '',
    priority: row.priority || 'Normal',
    resourcePreparationSelected: Boolean(row.resource_preparation_selected),
    nextAction: row.next_action || '',
    nextActionDueAt: row.next_action_due_at,
    tags: json(row.tags_json),
    firstCollectedAt: row.first_collected_at,
    lastCheckedAt: row.last_checked_at,
    lastUpdatedAt: row.last_updated_at,
    sourceStatus: row.source_status
  };
}

export function mapPortal(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    portalType: row.portal_type,
    baseUrl: row.base_url,
    connectorKey: row.connector_key,
    provider: row.provider || row.connector_key,
    organizationName: row.organization_name || row.name,
    accountScope: row.account_scope || 'agency',
    opportunityGroup: row.opportunity_group || (row.is_primary ? 'caleprocure' : 'priority'),
    authMode: row.auth_mode || 'public',
    enabled: Boolean(row.enabled),
    isPrimary: Boolean(row.is_primary),
    cadence: row.cadence,
    status: row.status,
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    settings: json(row.settings_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    portalId: row.portal_id,
    portalName: row.portal_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    foundCount: row.found_count,
    newCount: row.new_count,
    updatedCount: row.updated_count,
    duplicateCount: row.duplicate_count,
    progressStage: row.progress_stage && (row.progress_stage !== 'Queued' || row.status === 'Running')
      ? row.progress_stage : (row.status === 'Completed' ? 'Completed' : row.status === 'Failed' ? 'Failed' : 'Queued'),
    progressCurrent: Number(row.progress_current || 0),
    progressTotal: Number(row.progress_total || 0),
    warnings: json(row.warnings_json),
    errorMessage: row.error_message
  };
}
