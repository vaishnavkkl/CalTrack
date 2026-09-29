import { randomUUID } from 'node:crypto';
import { db } from './database.mjs';
import { config } from './config.mjs';
import { collectCalEProcure } from './connectors/caleprocure.mjs';
import { evaluateOpportunity } from './relevance.mjs';
const isOpen = (item) => !item.closesAt || new Date(item.closesAt).getTime() > Date.now();

function applicationSettings() {
  const row = db.prepare(`SELECT value_json FROM settings WHERE key = 'application'`).get();
  try {
    return JSON.parse(row?.value_json || '{}');
  } catch {
    return {};
  }
}

export async function runCollection(portal, jobId = randomUUID()) {
  const startedAt = new Date().toISOString();
  db.prepare(`INSERT INTO collection_jobs (id, portal_id, portal_name, status, started_at)
    VALUES (?, ?, ?, 'Running', ?)`).run(jobId, portal.id, portal.name, startedAt);
  db.prepare(`UPDATE portals SET status = 'Collecting', last_run_at = ?, updated_at = ? WHERE id = ?`)
    .run(startedAt, startedAt, portal.id);

  const reportProgress = ({ stage, current = 0, total = 0 }) => {
    db.prepare(`UPDATE collection_jobs SET progress_stage = ?, progress_current = ?, progress_total = ? WHERE id = ?`)
      .run(String(stage).slice(0, 120), Math.max(0, Number(current) || 0), Math.max(0, Number(total) || 0), jobId);
  };

  try {
    if (portal.connector_key !== 'caleprocure') {
      throw new Error('This portal is configured for manual import; no automated connector is active.');
    }
    const settings = applicationSettings();
    const discovered = await collectCalEProcure({
      timeoutMs: config.caleProcureTimeoutMs,
      onProgress: reportProgress
    });
    const warnings = [];
    const collected = [];
    reportProgress({ stage: 'Qualifying RFOs', current: 0, total: discovered.length });
    for (const [index, item] of discovered.entries()) {
      reportProgress({ stage: 'Qualifying RFOs', current: index + 1, total: discovered.length });
      if (!isOpen(item)) continue;
      // Relevance is intentionally assessed only after every open listing has
      // had a detail-page attempt.  Titles are inconsistent and often omit the
      // actual technology scope; a title-first gate caused legitimate RFOs to
      // disappear before their description and attachments could be examined.
      if (!item.detailsRetrieved) {
        warnings.push(`Details could not be read for ${item.solicitationNumber}; title-only evaluation was used and this event will be retried next run.`);
      }
      const evaluation = evaluateOpportunity(item, settings);
      if (!evaluation.relevant) continue;
      collected.push({
        ...item,
        category: evaluation.category,
        relevanceScore: evaluation.score,
        matchedKeywords: evaluation.matchedKeywords
      });
    }

    let created = 0;
    let updated = 0;
    let duplicates = 0;
    const now = new Date().toISOString();
    reportProgress({ stage: 'Saving RFO intelligence', current: 0, total: collected.length });
    for (const [index, item] of collected.entries()) {
      reportProgress({ stage: 'Saving RFO intelligence', current: index + 1, total: collected.length });
      const existing = db.prepare(`SELECT id FROM opportunities
        WHERE (source_portal = ? AND solicitation_number = ?) OR source_url = ? LIMIT 1`)
        .get(portal.name, item.solicitationNumber, item.sourceUrl);
      if (existing) {
        db.prepare(`UPDATE opportunities SET solicitation_type = ?, title = ?, agency = ?, description = ?,
          category = ?, published_at = COALESCE(?, published_at), closes_at = ?, contact_email = ?,
          source_url = ?, attachments_json = ?, relevance_score = ?, last_checked_at = ?,
          last_updated_at = ?, source_status = ?, source_group = ? WHERE id = ?`)
          .run(item.solicitationType, item.title, item.agency, item.description, item.category,
            item.publishedAt, item.closesAt, item.contactEmail || null, item.sourceUrl,
            JSON.stringify(item.attachments || []), item.relevanceScore, now, now,
            item.sourceStatus, portal.opportunity_group || 'priority', existing.id);
        updated += 1;
        duplicates += 1;
      } else {
        db.prepare(`INSERT INTO opportunities
          (id, solicitation_number, solicitation_type, title, agency, description, category, published_at,
            closes_at, location, contact_email, source_portal, source_url, attachments_json, status,
            relevance_score, first_collected_at, last_checked_at, last_updated_at, source_status, source_group)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'California', ?, ?, ?, ?, 'Not reviewed', ?, ?, ?, ?, ?, ?)`)
          .run(`caleprocure-${item.externalId}`, item.solicitationNumber, item.solicitationType, item.title,
            item.agency, item.description, item.category, item.publishedAt || now, item.closesAt,
            item.contactEmail || null, portal.name, item.sourceUrl, JSON.stringify(item.attachments || []),
            item.relevanceScore, now, now, now, item.sourceStatus, portal.opportunity_group || 'priority');
        created += 1;
      }
    }
    const finishedAt = new Date().toISOString();
    if (collected.length === 0) warnings.push('No open, non-hardware IT opportunities matched this run.');
    db.prepare(`UPDATE collection_jobs SET status = 'Completed', finished_at = ?, found_count = ?,
      new_count = ?, updated_count = ?, duplicate_count = ?, warnings_json = ?, progress_stage = 'Completed',
      progress_current = ?, progress_total = ? WHERE id = ?`)
      .run(finishedAt, discovered.length, created, updated, duplicates, JSON.stringify(warnings.slice(0, 25)), collected.length, collected.length, jobId);
    db.prepare(`UPDATE portals SET status = 'Healthy', last_success_at = ?, last_error = NULL, updated_at = ? WHERE id = ?`)
      .run(finishedAt, finishedAt, portal.id);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    db.prepare(`UPDATE collection_jobs SET status = 'Failed', finished_at = ?, error_message = ?, progress_stage = 'Failed' WHERE id = ?`)
      .run(finishedAt, message, jobId);
    db.prepare(`UPDATE portals SET status = 'Error', last_error = ?, updated_at = ? WHERE id = ?`)
      .run(message, finishedAt, portal.id);
  }
  return jobId;
}
