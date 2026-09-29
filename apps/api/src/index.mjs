import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from './config.mjs';
import { db, mapJob, mapOpportunity, mapPortal } from './database.mjs';
import { seed } from './seed.mjs';
import { runCollection } from './collector.mjs';
import { DEFAULT_EXCLUDED_KEYWORDS, DEFAULT_IT_KEYWORDS, evaluateOpportunity } from './relevance.mjs';
import { decodeResume } from './resumes.mjs';
import { serveWeb } from './static.mjs';

seed();
fs.mkdirSync(config.responseFilesPath, { recursive: true });

const sessions = new Map();
const loginFailures = new Map();
const loginWindowMs = 15 * 60 * 1000;
const maxLoginFailures = 10;
const allowedPriorities = ['Low', 'Normal', 'High', 'Critical'];
const managementRoles = ['super_admin'];
const decisions = ['Not reviewed', 'Qualified', 'Not qualified'];
const finalStages = ['Submitted', 'Not submitted'];
const noBidReasons = ['Vendor qualification gap', 'Expertise gap', 'Resource unavailable', 'Commercial risk', 'Timeline risk', 'Other'];
const sourcingStatuses = ['Not published', 'Open', 'Sourcing complete'];
const visibleOpportunityWhere = `archived = 0
  AND source_status != 'Closed'
  AND (closes_at IS NULL OR datetime(closes_at) > datetime('now'))
  AND lower(category) != 'hardware'`;

function mapWorkflow(row) {
  if (!row) return null;
  return {
    opportunityId: row.opportunity_id,
    decision: row.decision,
    decisionReason: row.decision_reason,
    decisionNotes: row.decision_notes,
    requiredResources: safeJson(row.required_resources_json),
    uAndARequired: row.ua_required,
    candidatesRequired: row.candidates_required,
    candidatesProvided: row.candidates_provided,
    contractTerm: row.contract_term,
    budget: row.budget,
    contractMode: row.contract_mode,
    sourcingBrief: row.sourcing_brief,
    sourcingStatus: row.sourcing_status,
    documentationItems: safeJson(row.documentation_items_json),
    documentationNotes: row.documentation_notes,
    responseStatus: row.response_status,
    responseReviewNotes: row.response_review_notes,
    decidedBy: row.decided_by,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCandidate(row) {
  if (!row) return null;
  const resume = db.prepare('SELECT file_name, size_bytes FROM candidate_resumes WHERE candidate_id = ?').get(row.id);
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    resourceRequirementId: row.resource_requirement_id,
    fullName: row.full_name,
    currentTitle: row.current_title,
    location: row.location,
    yearsExperience: row.years_experience,
    availability: row.availability,
    skills: safeJson(row.skills_json),
    qualificationSummary: row.qualification_summary,
    profileReference: row.profile_reference,
    resume: resume ? { fileName: resume.file_name, sizeBytes: resume.size_bytes, downloadUrl: `/api/candidates/${row.id}/resume` } : null,
    submittedBy: row.submitted_by,
    submittedByName: row.submitted_by_name || '',
    reviewStatus: row.review_status,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapResponseFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    documentationItemId: row.documentation_item_id,
    fileName: row.file_name,
    category: row.category,
    description: row.description,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    version: row.version,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name || '',
    reviewStatus: row.review_status,
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    downloadUrl: `/api/response-files/${row.id}/download`
  };
}

function responseFileRow(id) {
  return db.prepare(`SELECT f.*, uploader.display_name uploaded_by_name,
    reviewer.display_name reviewed_by_name
    FROM response_files f
    JOIN users uploader ON uploader.id = f.uploaded_by
    LEFT JOIN users reviewer ON reviewer.id = f.reviewed_by
    WHERE f.id = ?`).get(id);
}

function safeJson(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function sanitizeOpportunity(opportunity, role) {
  if (!opportunity || role !== 'sourcing_user') return opportunity;
  return {
    ...opportunity,
    contactName: undefined,
    contactEmail: undefined,
    sourceUrl: undefined,
    attachments: [],
    notes: '',
    ownerName: '',
    nextAction: '',
    tags: []
  };
}

function sanitizeWorkflow(workflow, role) {
  if (!workflow || role !== 'sourcing_user') return workflow;
  return {
    opportunityId: workflow.opportunityId,
    decision: workflow.decision,
    decisionReason: '',
    decisionNotes: '',
    requiredResources: workflow.requiredResources,
    uAndARequired: '',
    candidatesRequired: null,
    candidatesProvided: null,
    contractTerm: '',
    budget: '',
    contractMode: '',
    sourcingBrief: workflow.sourcingBrief,
    sourcingStatus: workflow.sourcingStatus,
    documentationItems: [],
    documentationNotes: '',
    responseStatus: 'Not started',
    responseReviewNotes: '',
    decidedBy: '',
    reviewedBy: '',
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt
  };
}

function requireManagement(res, user) {
  if (managementRoles.includes(user.role)) return true;
  send(res, 403, { error: 'Bid manager access is required.' });
  return false;
}

function ensureWorkflow(opportunityId) {
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO bid_workflows (opportunity_id, decision, created_at, updated_at)
    VALUES (?, 'Not reviewed', ?, ?)`).run(opportunityId, now, now);
  return db.prepare('SELECT * FROM bid_workflows WHERE opportunity_id = ?').get(opportunityId);
}

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    let value = '';
    try { value = decodeURIComponent(part.slice(index + 1)); } catch { /* Ignore malformed cookies. */ }
    return [part.slice(0, index).trim(), value];
  }));
}

function currentUser(req) {
  const token = parseCookies(req).caltrack_session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return db.prepare('SELECT id, username, email, role, display_name displayName FROM users WHERE id = ?').get(session.userId);
}

function integrationAuthorized(req) {
  if (!config.integrationApiKey) return false;
  const candidate = Buffer.from(String(req.headers['x-caltrack-api-key'] || ''));
  const expected = Buffer.from(config.integrationApiKey);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function applicationSettings() {
  const row = db.prepare(`SELECT value_json FROM settings WHERE key = 'application'`).get();
  try {
    return JSON.parse(row?.value_json || '{}');
  } catch {
    return {};
  }
}

async function body(req, maxBytes = 1_000_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) throw Object.assign(new Error('Request body is too large'), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error('Invalid JSON request.'), { status: 400 }); }
}

function opportunityPatch(input) {
  const patch = {};
  if (typeof input.reviewed === 'boolean') patch.reviewed = input.reviewed ? 1 : 0;
  if (typeof input.saved === 'boolean') patch.saved = input.saved ? 1 : 0;
  if (typeof input.archived === 'boolean') patch.archived = input.archived ? 1 : 0;
  if (typeof input.notes === 'string') patch.notes = input.notes.slice(0, 10000);
  if (typeof input.ownerName === 'string') patch.owner_name = input.ownerName.slice(0, 200);
  if (typeof input.priority === 'string' && allowedPriorities.includes(input.priority)) patch.priority = input.priority;
  if (typeof input.resourcePreparationSelected === 'boolean') patch.resource_preparation_selected = input.resourcePreparationSelected ? 1 : 0;
  if (typeof input.nextAction === 'string') patch.next_action = input.nextAction.slice(0, 2000);
  if (input.nextActionDueAt === null || input.nextActionDueAt === '') patch.next_action_due_at = null;
  else if (typeof input.nextActionDueAt === 'string' && !Number.isNaN(Date.parse(input.nextActionDueAt))) {
    patch.next_action_due_at = new Date(input.nextActionDueAt).toISOString();
  }
  if (Array.isArray(input.tags)) patch.tags_json = JSON.stringify(input.tags.map(String).slice(0, 20));
  return patch;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return serveWeb(req, res, url.pathname);

  try {
    if (config.production && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      ((req.headers.origin && req.headers.origin !== config.appOrigin) || req.headers['sec-fetch-site'] === 'cross-site')) {
      return send(res, 403, { error: 'Request origin is not allowed.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, database: 'sqlite', time: new Date().toISOString() });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/opportunities') {
      if (!config.integrationApiKey) {
        return send(res, 503, { error: 'Set INTEGRATION_API_KEY before accepting source-feed data.' });
      }
      if (!integrationAuthorized(req)) return send(res, 401, { error: 'Invalid integration API key.' });
      const input = await body(req);
      const records = Array.isArray(input) ? input : (Array.isArray(input.opportunities) ? input.opportunities : [input]);
      if (records.length > 250) return send(res, 400, { error: 'A maximum of 250 opportunities is allowed per request.' });
      const settings = applicationSettings();
      const now = new Date().toISOString();
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const warnings = [];
      for (const record of records) {
        const title = String(record?.title || '').trim().slice(0, 500);
        const solicitationNumber = String(record?.solicitationNumber || record?.externalId || '').trim().slice(0, 160);
        const agency = String(record?.agency || record?.organization || '').trim().slice(0, 300);
        const sourcePortal = String(record?.sourcePortal || record?.provider || '').trim().slice(0, 160);
        if (!title || !solicitationNumber || !agency || !sourcePortal || /^cal eprocure$/i.test(sourcePortal)) {
          skipped += 1;
          warnings.push(`Skipped ${solicitationNumber || title || 'record'}: missing priority-source fields.`);
          continue;
        }
        const closesAt = record.closesAt && !Number.isNaN(Date.parse(record.closesAt))
          ? new Date(record.closesAt).toISOString()
          : null;
        if (closesAt && new Date(closesAt).getTime() <= Date.now()) {
          skipped += 1;
          continue;
        }
        const normalized = {
          title,
          description: String(record.description || '').slice(0, 12000),
          agency,
          department: String(record.department || '').slice(0, 300),
          attachments: Array.isArray(record.attachments) ? record.attachments : [],
          unspsc: Array.isArray(record.unspsc) ? record.unspsc : []
        };
        const evaluation = evaluateOpportunity(normalized, settings);
        if (!evaluation.relevant) {
          skipped += 1;
          continue;
        }
        const attachments = normalized.attachments.slice(0, 50).map((attachment) => ({
          name: String(attachment?.name || 'Solicitation document').slice(0, 180),
          url: String(attachment?.url || '').slice(0, 1000)
        })).filter((attachment) => /^https?:\/\//i.test(attachment.url));
        const existing = db.prepare(`SELECT id FROM opportunities
          WHERE (source_portal = ? AND solicitation_number = ?)
             OR (? != '' AND source_url = ?)
          LIMIT 1`)
          .get(sourcePortal, solicitationNumber, String(record.sourceUrl || ''), String(record.sourceUrl || ''));
        const publishedAt = record.publishedAt && !Number.isNaN(Date.parse(record.publishedAt))
          ? new Date(record.publishedAt).toISOString()
          : now;
        if (existing) {
          db.prepare(`UPDATE opportunities SET solicitation_type = ?, title = ?, agency = ?, department = ?,
            description = ?, category = ?, published_at = ?, closes_at = ?, contact_name = ?,
            contact_email = ?, source_url = ?, attachments_json = ?, relevance_score = ?,
            source_status = 'Open', source_group = 'priority', last_checked_at = ?, last_updated_at = ?
            WHERE id = ?`)
            .run(
              String(record.solicitationType || 'RFP').slice(0, 20), title, agency, normalized.department,
              normalized.description, evaluation.category, publishedAt, closesAt,
              String(record.contactName || '').slice(0, 200), String(record.contactEmail || '').slice(0, 300),
              String(record.sourceUrl || '').slice(0, 1000), JSON.stringify(attachments),
              evaluation.score, now, now, existing.id
            );
          updated += 1;
        } else {
          db.prepare(`INSERT INTO opportunities
            (id, solicitation_number, solicitation_type, title, agency, department, description,
              category, published_at, closes_at, location, contact_name, contact_email, source_portal,
              source_url, attachments_json, status, relevance_score, first_collected_at,
              last_checked_at, last_updated_at, source_status, source_group)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not reviewed', ?, ?, ?, ?, 'Open', 'priority')`)
            .run(
              randomUUID(), solicitationNumber, String(record.solicitationType || 'RFP').slice(0, 20),
              title, agency, normalized.department, normalized.description, evaluation.category,
              publishedAt, closesAt, String(record.location || 'California').slice(0, 200),
              String(record.contactName || '').slice(0, 200), String(record.contactEmail || '').slice(0, 300),
              sourcePortal, String(record.sourceUrl || '').slice(0, 1000), JSON.stringify(attachments),
              evaluation.score, now, now, now
            );
          created += 1;
        }
      }
      return send(res, 200, { created, updated, skipped, warnings: warnings.slice(0, 25) });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/collect/caleprocure') {
      if (!config.integrationApiKey) {
        return send(res, 503, { error: 'Set INTEGRATION_API_KEY before accepting integration requests.' });
      }
      if (!integrationAuthorized(req)) return send(res, 401, { error: 'Invalid integration API key.' });
      const portal = db.prepare(`SELECT * FROM portals WHERE id = 'caleprocure' AND enabled = 1`).get();
      if (!portal) return send(res, 409, { error: 'The Cal eProcure connector is not enabled.' });
      const jobId = randomUUID();
      void runCollection(portal, jobId).catch((error) => console.error('Cal eProcure collection failed:', error));
      return send(res, 202, { job: mapJob(db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(jobId)) });
    }
    if (req.method === 'GET' && url.pathname === '/api/integrations/opportunities') {
      if (!config.integrationApiKey) {
        return send(res, 503, { error: 'Set INTEGRATION_API_KEY before accepting integration requests.' });
      }
      if (!integrationAuthorized(req)) return send(res, 401, { error: 'Invalid integration API key.' });
      const sourceGroup = url.searchParams.get('group');
      const dueDays = Math.min(90, Math.max(0, Number(url.searchParams.get('dueDays') || 0)));
      const groupClause = ['caleprocure', 'priority'].includes(sourceGroup) ? ' AND source_group = ?' : '';
      const dueClause = dueDays ? ` AND closes_at IS NOT NULL
        AND datetime(closes_at) <= datetime('now', '+${dueDays} days')` : '';
      const query = db.prepare(`SELECT * FROM opportunities
        WHERE ${visibleOpportunityWhere}${groupClause}${dueClause}
        ORDER BY closes_at IS NULL, datetime(closes_at) ASC LIMIT 250`);
      const rows = (groupClause ? query.all(sourceGroup) : query.all()).map(mapOpportunity);
      return send(res, 200, { opportunities: rows });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const input = await body(req);
      const identifier = String(input.identifier || input.email || '').trim().toLowerCase().slice(0, 254);
      const attemptKey = `${identifier}:${req.socket.remoteAddress || ''}`;
      const now = Date.now();
      const failures = loginFailures.get(attemptKey);
      if (failures?.until <= now) loginFailures.delete(attemptKey);
      else if (failures?.count >= maxLoginFailures) return send(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' }, { 'Retry-After': String(Math.ceil((failures.until - now) / 1000)) });
      const user = db.prepare('SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?').get(identifier, identifier);
      const password = String(input.password || '');
      if (!user || password.length > 1024 ||
        !timingSafeEqual(scryptSync(password, user.password_salt, 64), Buffer.from(user.password_hash, 'hex'))) {
        loginFailures.set(attemptKey, { count: (loginFailures.get(attemptKey)?.count || 0) + 1, until: now + loginWindowMs });
        if (loginFailures.size > 5000) {
          for (const [key, value] of loginFailures) if (value.until <= now) loginFailures.delete(key);
          if (loginFailures.size > 5000) loginFailures.delete(loginFailures.keys().next().value);
        }
        return send(res, 401, { error: 'Username or password is incorrect.' });
      }
      loginFailures.delete(attemptKey);
      const sessionId = `${randomUUID()}.${randomBytes(24).toString('hex')}`;
      const signature = createHmac('sha256', config.sessionSecret).update(sessionId).digest('base64url');
      const token = `${sessionId}.${signature}`;
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
      const cookie = `caltrack_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${config.production ? '; Secure' : ''}`;
      return send(res, 200, { user: { id: user.id, username: user.username, email: user.email, role: user.role, displayName: user.display_name } }, { 'Set-Cookie': cookie });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = parseCookies(req).caltrack_session;
      if (token) sessions.delete(token);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'caltrack_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }

    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'Authentication required.' });
    if (req.method === 'GET' && url.pathname === '/api/auth/me') return send(res, 200, { user });

    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      const sourcingOnly = user.role === 'sourcing_user';
      const dashboardScope = sourcingOnly
        ? ` AND id IN (SELECT opportunity_id FROM bid_workflows WHERE decision = 'Qualified' AND sourcing_status = 'Open')`
        : ' AND resource_preparation_selected = 1';
      const totals = db.prepare(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN status = 'Not reviewed' THEN 1 ELSE 0 END) new_count,
        SUM(CASE WHEN saved = 1 THEN 1 ELSE 0 END) saved_count,
        SUM(CASE WHEN relevance_score >= 90 THEN 1 ELSE 0 END) high_match_count,
        SUM(CASE WHEN datetime(closes_at) BETWEEN datetime('now') AND datetime('now', '+14 days') THEN 1 ELSE 0 END) due_soon_count
        FROM opportunities WHERE ${visibleOpportunityWhere}${dashboardScope}`).get();
      const recent = db.prepare(`SELECT * FROM opportunities WHERE ${visibleOpportunityWhere}${dashboardScope}
        ORDER BY last_updated_at DESC LIMIT 5`).all().map(mapOpportunity).map((item) => sanitizeOpportunity(item, user.role));
      const upcoming = db.prepare(`SELECT * FROM opportunities WHERE ${visibleOpportunityWhere}${dashboardScope} AND closes_at IS NOT NULL
        ORDER BY datetime(closes_at) ASC LIMIT 4`).all().map(mapOpportunity).map((item) => sanitizeOpportunity(item, user.role));
      const portalErrors = db.prepare(`SELECT COUNT(*) count FROM portals WHERE status = 'Error'`).get().count;
      const lastJob = db.prepare('SELECT * FROM collection_jobs ORDER BY started_at DESC LIMIT 1').get();
      const workflowStats = db.prepare(`SELECT
        SUM(CASE WHEN decision = 'Not reviewed' THEN 1 ELSE 0 END) pending_decisions,
        SUM(CASE WHEN sourcing_status = 'Open' THEN 1 ELSE 0 END) open_sourcing,
        SUM(CASE WHEN response_status = 'Ready for review' THEN 1 ELSE 0 END) ready_for_review
        FROM bid_workflows b JOIN opportunities o ON o.id = b.opportunity_id
        WHERE o.archived = 0 AND o.resource_preparation_selected = 1`).get();
      return send(res, 200, {
        stats: { ...totals, ...workflowStats }, recent, upcoming,
        portalErrors: sourcingOnly ? 0 : portalErrors,
        lastJob: sourcingOnly ? null : mapJob(lastJob)
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/opportunities') {
      const sourceGroup = url.searchParams.get('group');
      const byGroup = ['caleprocure', 'priority'].includes(sourceGroup) ? ' AND source_group = ?' : '';
      const roleClause = user.role === 'sourcing_user'
        ? ` AND id IN (SELECT opportunity_id FROM bid_workflows WHERE decision = 'Qualified' AND sourcing_status = 'Open')`
        : '';
      const query = db.prepare(`SELECT * FROM opportunities WHERE ${visibleOpportunityWhere}${roleClause}${byGroup}
        ORDER BY closes_at IS NULL, datetime(closes_at) ASC`);
      const settings = applicationSettings();
      const rows = (byGroup ? query.all(sourceGroup) : query.all()).map(mapOpportunity)
        .filter((item) => evaluateOpportunity(item, settings).relevant)
        .map((item) => sanitizeOpportunity(item, user.role));
      return send(res, 200, { opportunities: rows });
    }
    const opportunityMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)$/);
    if (opportunityMatch && req.method === 'GET') {
      const opportunity = mapOpportunity(db.prepare(`SELECT * FROM opportunities WHERE id = ? AND ${visibleOpportunityWhere}`).get(opportunityMatch[1]));
      if (!opportunity) return send(res, 404, { error: 'Opportunity not found or no longer open.' });
      if (user.role === 'sourcing_user') {
        const workflow = ensureWorkflow(opportunity.id);
        if (workflow.decision !== 'Qualified' || workflow.sourcing_status !== 'Open') {
          return send(res, 403, { error: 'This RFO has not been published to the sourcing team.' });
        }
      }
      return send(res, 200, { opportunity: sanitizeOpportunity(opportunity, user.role) });
    }
    if (opportunityMatch && req.method === 'PATCH') {
      if (!requireManagement(res, user)) return;
      const patch = opportunityPatch(await body(req));
      const entries = Object.entries(patch);
      if (!entries.length) return send(res, 400, { error: 'No valid fields were provided.' });
      entries.push(['last_updated_at', new Date().toISOString()]);
      const clause = entries.map(([key]) => `${key} = ?`).join(', ');
      db.prepare(`UPDATE opportunities SET ${clause} WHERE id = ?`).run(...entries.map(([, value]) => value), opportunityMatch[1]);
      return send(res, 200, { opportunity: mapOpportunity(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunityMatch[1])) });
    }
    if (opportunityMatch && req.method === 'DELETE') {
      if (user.role !== 'super_admin') return send(res, 403, { error: 'Bid manager access is required.' });
      const storedFiles = db.prepare(`SELECT storage_path FROM response_files WHERE opportunity_id = ?
        UNION ALL SELECT r.storage_path FROM candidate_resumes r JOIN candidates c ON c.id = r.candidate_id WHERE c.opportunity_id = ?`).all(opportunityMatch[1], opportunityMatch[1]);
      db.prepare('DELETE FROM opportunities WHERE id = ?').run(opportunityMatch[1]);
      for (const storedFile of storedFiles) {
        const targetPath = path.resolve(config.responseFilesPath, storedFile.storage_path);
        if (targetPath.startsWith(`${path.resolve(config.responseFilesPath)}${path.sep}`) && fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      }
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/bids') {
      const rows = db.prepare(`SELECT o.*, b.*,
        (SELECT COUNT(*) FROM candidates c WHERE c.opportunity_id = o.id) candidate_count,
        (SELECT COUNT(*) FROM candidates c WHERE c.opportunity_id = o.id AND c.review_status = 'Shortlisted') shortlisted_count,
        (SELECT COUNT(*) FROM response_files f WHERE f.opportunity_id = o.id) response_file_count,
        (SELECT COUNT(*) FROM response_files f WHERE f.opportunity_id = o.id AND f.review_status != 'Approved') pending_file_count
        FROM opportunities o
        JOIN bid_workflows b ON b.opportunity_id = o.id
        WHERE o.archived = 0 AND o.resource_preparation_selected = 1
        ORDER BY CASE o.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
          CASE b.decision WHEN 'Not reviewed' THEN 0 WHEN 'Qualified' THEN 1 ELSE 2 END,
          o.closes_at IS NULL, datetime(o.closes_at) ASC`).all();
      const bids = rows
        .filter((row) => user.role !== 'sourcing_user' || (row.decision === 'Qualified' && row.sourcing_status === 'Open'))
        .map((row) => ({
          opportunity: sanitizeOpportunity(mapOpportunity(row), user.role),
          workflow: sanitizeWorkflow(mapWorkflow(row), user.role),
          candidateCount: user.role === 'sourcing_user' ? 0 : row.candidate_count,
          shortlistedCount: user.role === 'sourcing_user' ? 0 : row.shortlisted_count,
          responseFileCount: user.role === 'sourcing_user' ? 0 : row.response_file_count,
          pendingFileCount: user.role === 'sourcing_user' ? 0 : row.pending_file_count
        }));
      return send(res, 200, { bids });
    }

    const workflowMatch = url.pathname.match(/^\/api\/bids\/([^/]+)\/workflow$/);
    if (workflowMatch && req.method === 'PATCH') {
      if (!requireManagement(res, user)) return;
      const opportunity = db.prepare('SELECT id, status FROM opportunities WHERE id = ?').get(workflowMatch[1]);
      if (!opportunity) return send(res, 404, { error: 'RFO not found.' });
      const current = ensureWorkflow(workflowMatch[1]);
      const input = await body(req);
      const adminFields = ['decision', 'decisionReason', 'decisionNotes', 'requiredResources', 'sourcingBrief',
        'sourcingStatus', 'documentationItems', 'documentationNotes', 'requestReview', 'uAndARequired',
        'candidatesRequired', 'candidatesProvided', 'contractTerm', 'budget', 'contractMode'];
      if (!managementRoles.includes(user.role) && adminFields.some((field) => input[field] !== undefined)) {
        return send(res, 403, { error: 'Bid manager access is required to qualify RFOs and prepare response packages.' });
      }
      if (input.finalStage !== undefined && user.role !== 'super_admin') {
        return send(res, 403, { error: 'Only Bid manager can set the final submission stage.' });
      }
      if (input.decision !== undefined && !managementRoles.includes(user.role)) {
        return send(res, 403, { error: 'Bid manager access is required to make the qualification decision.' });
      }
      const nextDecision = decisions.includes(input.decision) ? input.decision : current.decision;
      const decisionReason = nextDecision === 'Not qualified'
        ? (noBidReasons.includes(input.decisionReason) ? input.decisionReason : current.decision_reason)
        : '';
      if (nextDecision === 'Not qualified' && !decisionReason) {
        return send(res, 400, { error: 'Select a not-qualified reason.' });
      }
      if (user.role !== 'super_admin' && typeof input.responseReviewNotes === 'string') {
        return send(res, 403, { error: 'Only Bid manager can add final review notes.' });
      }
      const responseReviewNotes = typeof input.responseReviewNotes === 'string'
        ? input.responseReviewNotes.slice(0, 8000) : current.response_review_notes;
      const finalStage = finalStages.includes(input.finalStage) ? input.finalStage : '';
      if (input.finalStage !== undefined && !finalStage) return send(res, 400, { error: 'Select Submitted or Not submitted.' });
      if (finalStage === 'Not submitted' && !responseReviewNotes.trim()) {
        return send(res, 400, { error: 'Add final review notes explaining why the response was not submitted.' });
      }
      const requiredResources = Array.isArray(input.requiredResources)
        ? input.requiredResources.slice(0, 30).map((resource) => ({
          id: String(resource.id || randomUUID()).slice(0, 80),
          title: String(resource.title || '').trim().slice(0, 180),
          count: Math.max(1, Math.min(99, Number(resource.count || 1))),
          minimumYears: Math.max(0, Math.min(50, Number(resource.minimumYears || 0))),
          skills: Array.isArray(resource.skills) ? resource.skills.map(String).slice(0, 25) : [],
          qualifications: String(resource.qualifications || '').slice(0, 2000)
        })).filter((resource) => resource.title)
        : safeJson(current.required_resources_json);
      const optionalCount = (value, fallback) => {
        if (value === undefined) return fallback;
        if (value === null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.min(9999, Math.trunc(number))) : fallback;
      };
      const uAndARequired = ['Yes', 'No', ''].includes(input.uAndARequired) ? input.uAndARequired : current.ua_required;
      const candidatesRequired = optionalCount(input.candidatesRequired, current.candidates_required);
      const candidatesProvided = optionalCount(input.candidatesProvided, current.candidates_provided);
      const contractTerm = typeof input.contractTerm === 'string' ? input.contractTerm.trim().slice(0, 300) : current.contract_term;
      const budget = typeof input.budget === 'string' ? input.budget.trim().slice(0, 300) : current.budget;
      const contractMode = typeof input.contractMode === 'string' ? input.contractMode.trim().slice(0, 300) : current.contract_mode;
      const documentationItems = Array.isArray(input.documentationItems)
        ? input.documentationItems.slice(0, 60).map((item) => ({
          id: String(item.id || randomUUID()).slice(0, 80),
          label: String(item.label || '').trim().slice(0, 220),
          required: item.required !== false,
          status: ['Missing', 'In progress', 'Ready'].includes(item.status) ? item.status : 'Missing',
          owner: String(item.owner || '').slice(0, 160)
        })).filter((item) => item.label)
        : safeJson(current.documentation_items_json);
      const sourcingStatus = sourcingStatuses.includes(input.sourcingStatus) ? input.sourcingStatus : current.sourcing_status;
      if (sourcingStatus !== 'Not published' && nextDecision !== 'Qualified') {
        return send(res, 400, { error: 'Qualify the RFO before publishing a sourcing brief.' });
      }
      const sourcingBrief = typeof input.sourcingBrief === 'string' ? input.sourcingBrief.slice(0, 8000) : current.sourcing_brief;
      if (sourcingStatus !== 'Not published' && (!requiredResources.length || !sourcingBrief.trim())) {
        return send(res, 400, { error: 'Add at least one required role and a sourcing brief before publishing.' });
      }
      const missingRequiredDocuments = documentationItems.some((item) => item.required && item.status !== 'Ready');
      if ((input.requestReview === true || finalStage === 'Submitted') && missingRequiredDocuments) {
        return send(res, 409, { error: 'Complete every required documentation item before advancing the response.' });
      }
      const responseFileStats = db.prepare(`SELECT COUNT(*) total,
        SUM(CASE WHEN review_status = 'Approved' THEN 1 ELSE 0 END) approved
        FROM response_files WHERE opportunity_id = ?`).get(opportunity.id);
      if ((input.requestReview === true || finalStage === 'Submitted') && !responseFileStats.total) {
        return send(res, 409, { error: 'Upload the response package before advancing it to review.' });
      }
      if (finalStage === 'Submitted'
        && Number(responseFileStats.approved || 0) !== Number(responseFileStats.total)) {
        return send(res, 409, { error: 'Approve every uploaded file before marking the RFO submitted.' });
      }
      if ((input.requestReview === true || finalStage) && nextDecision !== 'Qualified') {
        return send(res, 409, { error: 'Only a qualified RFO can advance to response review.' });
      }
      const preparationChanged = managementRoles.includes(user.role)
        && ['documentationItems', 'documentationNotes'].some((field) => input[field] !== undefined);
      const responseStatus = finalStage || (input.requestReview === true
        ? 'Ready for review'
        : preparationChanged ? 'In progress' : current.response_status);
      const now = new Date().toISOString();
      db.prepare(`UPDATE bid_workflows SET decision = ?, decision_reason = ?, decision_notes = ?,
        required_resources_json = ?, ua_required = ?, candidates_required = ?, candidates_provided = ?,
        contract_term = ?, budget = ?, contract_mode = ?, sourcing_brief = ?, sourcing_status = ?, documentation_items_json = ?,
        documentation_notes = ?, response_status = ?, response_review_notes = ?, decided_by = ?, reviewed_by = ?,
        updated_at = ? WHERE opportunity_id = ?`).run(
        nextDecision,
        decisionReason,
        typeof input.decisionNotes === 'string' ? input.decisionNotes.slice(0, 5000) : current.decision_notes,
        JSON.stringify(requiredResources),
        uAndARequired,
        candidatesRequired,
        candidatesProvided,
        contractTerm,
        budget,
        contractMode,
        sourcingBrief,
        sourcingStatus,
        JSON.stringify(documentationItems),
        typeof input.documentationNotes === 'string' ? input.documentationNotes.slice(0, 8000) : current.documentation_notes,
        responseStatus,
        responseReviewNotes,
        input.decision !== undefined ? (user.displayName || user.email) : current.decided_by,
        (finalStage || input.responseReviewNotes !== undefined) && user.role === 'super_admin'
          ? (user.displayName || user.email) : current.reviewed_by,
        now,
        opportunity.id
      );
      const opportunityStatus = finalStage || nextDecision;
      db.prepare('UPDATE opportunities SET status = ?, reviewed = ?, last_updated_at = ? WHERE id = ?')
        .run(opportunityStatus, nextDecision === 'Not reviewed' ? 0 : 1, now, opportunity.id);
      return send(res, 200, {
        workflow: mapWorkflow(db.prepare('SELECT * FROM bid_workflows WHERE opportunity_id = ?').get(opportunity.id)),
        opportunity: mapOpportunity(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunity.id))
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/candidates') {
      const opportunityId = String(url.searchParams.get('opportunity') || '');
      const clauses = [];
      const values = [];
      if (opportunityId) { clauses.push('c.opportunity_id = ?'); values.push(opportunityId); }
      if (user.role === 'sourcing_user') { clauses.push('c.submitted_by = ?'); values.push(user.id); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const candidates = db.prepare(`SELECT c.*, u.display_name submitted_by_name FROM candidates c
        JOIN users u ON u.id = c.submitted_by ${where} ORDER BY c.updated_at DESC`).all(...values).map(mapCandidate);
      return send(res, 200, { candidates });
    }
    if (req.method === 'POST' && url.pathname === '/api/candidates') {
      const input = await body(req, 8 * 1024 * 1024);
      const opportunityId = String(input.opportunityId || '');
      if (!db.prepare('SELECT id FROM opportunities WHERE id = ?').get(opportunityId)) {
        return send(res, 404, { error: 'RFO not found.' });
      }
      const workflow = ensureWorkflow(opportunityId);
      if (!workflow || workflow.decision !== 'Qualified' || workflow.sourcing_status !== 'Open') {
        return send(res, 409, { error: 'Candidate sourcing is not open for this RFO.' });
      }
      const requiredResources = safeJson(workflow.required_resources_json);
      const resourceRequirementId = String(input.resourceRequirementId || '');
      if (!requiredResources.some((resource) => resource.id === resourceRequirementId)) {
        return send(res, 400, { error: 'Select the role this candidate is being sourced for.' });
      }
      const fullName = String(input.fullName || '').trim().slice(0, 180);
      if (!fullName) return send(res, 400, { error: 'Candidate name is required.' });
      const id = randomUUID();
      const now = new Date().toISOString();
      const resume = input.resume ? decodeResume(input.resume) : null;
      const storagePath = resume ? `resume-${id}${resume.extension}` : null;
      if (resume) fs.writeFileSync(path.join(config.responseFilesPath, storagePath), resume.data, { flag: 'wx' });
      db.exec('BEGIN');
      try {
      db.prepare(`INSERT INTO candidates (id, opportunity_id, resource_requirement_id, full_name, current_title, location,
        years_experience, availability, skills_json, qualification_summary, profile_reference,
        submitted_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, opportunityId, resourceRequirementId, fullName, String(input.currentTitle || '').slice(0, 180),
        String(input.location || '').slice(0, 180), Math.max(0, Math.min(50, Number(input.yearsExperience || 0))),
        String(input.availability || '').slice(0, 180),
        JSON.stringify(Array.isArray(input.skills) ? input.skills.map(String).slice(0, 30) : []),
        String(input.qualificationSummary || '').slice(0, 5000), String(input.profileReference || '').slice(0, 500),
        user.id, now, now
      );
      if (resume) db.prepare(`INSERT INTO candidate_resumes (candidate_id, file_name, mime_type, size_bytes, storage_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, resume.name, resume.type, resume.data.length, storagePath, now);
      db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (storagePath) fs.rmSync(path.join(config.responseFilesPath, storagePath), { force: true });
        throw error;
      }
      return send(res, 201, { candidate: mapCandidate(db.prepare(`SELECT c.*, u.display_name submitted_by_name
        FROM candidates c JOIN users u ON u.id = c.submitted_by WHERE c.id = ?`).get(id)) });
    }
    const resumeMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/resume$/);
    if (resumeMatch && ['GET', 'DELETE'].includes(req.method)) {
      const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(resumeMatch[1]);
      if (!candidate || (user.role !== 'super_admin' && candidate.submitted_by !== user.id)) return send(res, 404, { error: 'Resume not found.' });
      const resume = db.prepare('SELECT * FROM candidate_resumes WHERE candidate_id = ?').get(candidate.id);
      if (!resume) return send(res, 404, { error: 'Resume not found.' });
      const target = path.resolve(config.responseFilesPath, resume.storage_path);
      if (!target.startsWith(`${path.resolve(config.responseFilesPath)}${path.sep}`)) return send(res, 400, { error: 'Invalid file path.' });
      if (req.method === 'DELETE') {
        fs.rmSync(target, { force: true });
        db.prepare('DELETE FROM candidate_resumes WHERE candidate_id = ?').run(candidate.id);
        return send(res, 200, { ok: true });
      }
      if (!fs.existsSync(target)) return send(res, 404, { error: 'Stored resume is unavailable.' });
      res.writeHead(200, { 'Content-Type': resume.mime_type, 'Content-Length': resume.size_bytes,
        'Content-Disposition': `attachment; filename="resume${path.extname(resume.file_name)}"; filename*=UTF-8''${encodeURIComponent(resume.file_name)}`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
      return;
    }
    const candidateMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)$/);
    if (candidateMatch && req.method === 'PATCH') {
      if (!requireManagement(res, user)) return;
      const current = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateMatch[1]);
      if (!current) return send(res, 404, { error: 'Candidate not found.' });
      const input = await body(req);
      const reviewStatus = ['New', 'Reviewing', 'Shortlisted', 'Rejected'].includes(input.reviewStatus)
        ? input.reviewStatus : current.review_status;
      db.prepare('UPDATE candidates SET review_status = ?, review_notes = ?, updated_at = ? WHERE id = ?')
        .run(reviewStatus, typeof input.reviewNotes === 'string' ? input.reviewNotes.slice(0, 5000) : current.review_notes,
          new Date().toISOString(), current.id);
      return send(res, 200, { candidate: mapCandidate(db.prepare(`SELECT c.*, u.display_name submitted_by_name
        FROM candidates c JOIN users u ON u.id = c.submitted_by WHERE c.id = ?`).get(current.id)) });
    }

    const bidFilesMatch = url.pathname.match(/^\/api\/bids\/([^/]+)\/files$/);
    if (bidFilesMatch && req.method === 'GET') {
      if (!requireManagement(res, user)) return;
      const files = db.prepare(`SELECT f.*, uploader.display_name uploaded_by_name,
        reviewer.display_name reviewed_by_name
        FROM response_files f
        JOIN users uploader ON uploader.id = f.uploaded_by
        LEFT JOIN users reviewer ON reviewer.id = f.reviewed_by
        WHERE f.opportunity_id = ? ORDER BY f.created_at DESC`).all(bidFilesMatch[1]).map(mapResponseFile);
      return send(res, 200, { files });
    }
    if (bidFilesMatch && req.method === 'POST') {
      if (!managementRoles.includes(user.role)) return send(res, 403, { error: 'Bid manager access is required to upload response files.' });
      const opportunity = db.prepare('SELECT id, status FROM opportunities WHERE id = ?').get(bidFilesMatch[1]);
      if (!opportunity) return send(res, 404, { error: 'RFO not found.' });
      const workflow = ensureWorkflow(opportunity.id);
      if (workflow.decision !== 'Qualified') return send(res, 409, { error: 'Only qualified RFOs can receive response files.' });
      if (finalStages.includes(opportunity.status) && user.role !== 'super_admin') {
        return send(res, 409, { error: 'The response package is locked after the final submission decision.' });
      }
      const input = await body(req, 35_000_000);
      const uploads = Array.isArray(input.files) ? input.files.slice(0, 10) : [];
      if (!uploads.length) return send(res, 400, { error: 'Select at least one response file.' });
      const documentationItemId = String(input.documentationItemId || '').slice(0, 80);
      const uploadedDocumentationItems = Array.isArray(input.documentationItems)
        ? input.documentationItems.slice(0, 60).map((item) => ({
          id: String(item.id || randomUUID()).slice(0, 80),
          label: String(item.label || '').trim().slice(0, 220),
          required: item.required !== false,
          status: ['Missing', 'In progress', 'Ready'].includes(item.status) ? item.status : 'Missing',
          owner: String(item.owner || '').slice(0, 160)
        })).filter((item) => item.label)
        : safeJson(workflow.documentation_items_json);
      const uploadedDocumentationNotes = typeof input.documentationNotes === 'string'
        ? input.documentationNotes.slice(0, 8000) : workflow.documentation_notes;
      const category = String(input.category || 'Response attachment').trim().slice(0, 120);
      const description = String(input.description || '').trim().slice(0, 1000);
      const now = new Date().toISOString();
      const prepared = [];
      const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.zip', '.png', '.jpg', '.jpeg']);
      for (const upload of uploads) {
        const fileName = path.basename(String(upload?.name || '')).replace(/[\x00-\x1f]/g, '').slice(0, 220);
        const extension = path.extname(fileName).toLowerCase();
        const mimeType = String(upload?.type || 'application/octet-stream').slice(0, 160);
        const encoded = String(upload?.data || '').replace(/^data:[^;]+;base64,/, '');
        if (!fileName || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
          return send(res, 400, { error: 'One of the selected files is invalid.' });
        }
        if (!allowedExtensions.has(extension)) {
          return send(res, 400, { error: `${fileName} is not an approved response-document type.` });
        }
        const fileBuffer = Buffer.from(encoded, 'base64');
        if (!fileBuffer.length || fileBuffer.length > 15_000_000) {
          return send(res, 400, { error: `${fileName || 'A file'} must be between 1 byte and 15 MB.` });
        }
        const id = randomUUID();
        const storageName = `${id}${extension}`;
        const targetPath = path.resolve(config.responseFilesPath, storageName);
        if (!targetPath.startsWith(`${path.resolve(config.responseFilesPath)}${path.sep}`)) {
          return send(res, 400, { error: 'Invalid response file path.' });
        }
        prepared.push({ id, fileName, mimeType, fileBuffer, storageName, targetPath });
      }
      const created = [];
      const writtenPaths = [];
      db.exec('BEGIN');
      try {
        for (const file of prepared) {
          const previous = db.prepare(`SELECT MAX(version) version FROM response_files
            WHERE opportunity_id = ? AND lower(file_name) = lower(?)`).get(opportunity.id, file.fileName);
          fs.writeFileSync(file.targetPath, file.fileBuffer, { flag: 'wx' });
          writtenPaths.push(file.targetPath);
          db.prepare(`INSERT INTO response_files (id, opportunity_id, documentation_item_id, file_name,
            category, description, mime_type, size_bytes, storage_path, version, uploaded_by,
            created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            file.id, opportunity.id, documentationItemId, file.fileName, category, description, file.mimeType,
            file.fileBuffer.length, file.storageName, Number(previous?.version || 0) + 1, user.id, now, now
          );
          created.push(mapResponseFile(responseFileRow(file.id)));
        }
        db.prepare(`UPDATE bid_workflows SET documentation_items_json = ?, documentation_notes = ?,
          response_status = 'In progress', reviewed_by = '', updated_at = ? WHERE opportunity_id = ?`)
          .run(JSON.stringify(uploadedDocumentationItems), uploadedDocumentationNotes, now, opportunity.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        for (const writtenPath of writtenPaths) {
          if (fs.existsSync(writtenPath)) fs.unlinkSync(writtenPath);
        }
        throw error;
      }
      return send(res, 201, { files: created });
    }

    const responseDownloadMatch = url.pathname.match(/^\/api\/response-files\/([^/]+)\/download$/);
    if (responseDownloadMatch && req.method === 'GET') {
      if (!requireManagement(res, user)) return;
      const file = responseFileRow(responseDownloadMatch[1]);
      if (!file) return send(res, 404, { error: 'Response file not found.' });
      const targetPath = path.resolve(config.responseFilesPath, file.storage_path);
      if (!targetPath.startsWith(`${path.resolve(config.responseFilesPath)}${path.sep}`) || !fs.existsSync(targetPath)) {
        return send(res, 404, { error: 'Stored response file is unavailable.' });
      }
      const downloadName = String(file.file_name).replace(/["\r\n]/g, '_');
      res.writeHead(200, {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Length': file.size_bytes,
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'X-Content-Type-Options': 'nosniff'
      });
      fs.createReadStream(targetPath).pipe(res);
      return;
    }

    const responseFileMatch = url.pathname.match(/^\/api\/response-files\/([^/]+)$/);
    if (responseFileMatch && req.method === 'PATCH') {
      if (user.role !== 'super_admin') return send(res, 403, { error: 'Only Bid manager can review uploaded files.' });
      const current = responseFileRow(responseFileMatch[1]);
      if (!current) return send(res, 404, { error: 'Response file not found.' });
      const input = await body(req);
      const reviewStatus = ['Pending review', 'Approved', 'Changes requested'].includes(input.reviewStatus)
        ? input.reviewStatus : current.review_status;
      const reviewNotes = typeof input.reviewNotes === 'string' ? input.reviewNotes.slice(0, 4000) : current.review_notes;
      if (reviewStatus === 'Changes requested' && !reviewNotes.trim()) {
        return send(res, 400, { error: 'Add review notes explaining the required changes.' });
      }
      const now = new Date().toISOString();
      db.prepare(`UPDATE response_files SET review_status = ?, review_notes = ?, reviewed_by = ?,
        updated_at = ? WHERE id = ?`).run(reviewStatus, reviewNotes, user.id, now, current.id);
      if (reviewStatus === 'Changes requested') {
        db.prepare(`UPDATE bid_workflows SET response_status = 'Changes requested', reviewed_by = ?,
          updated_at = ? WHERE opportunity_id = ?`).run(user.displayName || user.email, now, current.opportunity_id);
      }
      return send(res, 200, { file: mapResponseFile(responseFileRow(current.id)) });
    }
    if (responseFileMatch && req.method === 'DELETE') {
      if (!managementRoles.includes(user.role)) return send(res, 403, { error: 'Bid manager access is required to remove response files.' });
      const current = responseFileRow(responseFileMatch[1]);
      if (!current) return send(res, 404, { error: 'Response file not found.' });
      const opportunity = db.prepare('SELECT status FROM opportunities WHERE id = ?').get(current.opportunity_id);
      if (finalStages.includes(opportunity?.status) && user.role !== 'super_admin') {
        return send(res, 409, { error: 'The response package is locked after the final submission decision.' });
      }
      const targetPath = path.resolve(config.responseFilesPath, current.storage_path);
      if (!targetPath.startsWith(`${path.resolve(config.responseFilesPath)}${path.sep}`)) {
        return send(res, 400, { error: 'Invalid response file path.' });
      }
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      db.prepare('DELETE FROM response_files WHERE id = ?').run(current.id);
      return send(res, 200, { ok: true });
    }

    if (url.pathname.startsWith('/api/portals') && !requireManagement(res, user)) return;
    if (req.method === 'GET' && url.pathname === '/api/portals') {
      return send(res, 200, { portals: db.prepare('SELECT * FROM portals ORDER BY is_primary DESC, name').all().map(mapPortal) });
    }
    if (req.method === 'POST' && url.pathname === '/api/portals/collect-selected') {
      const input = await body(req);
      const requestedIds = Array.isArray(input.portalIds)
        ? Array.from(new Set(input.portalIds.map(String))).slice(0, 50)
        : [];
      if (!requestedIds.length) return send(res, 400, { error: 'Select at least one ready portal.' });
      const placeholders = requestedIds.map(() => '?').join(', ');
      const portals = db.prepare(`SELECT * FROM portals WHERE id IN (${placeholders})`).all(...requestedIds);
      const runnable = portals.filter((portal) => portal.enabled && portal.connector_key !== 'manual');
      const skipped = portals
        .filter((portal) => !portal.enabled || portal.connector_key === 'manual')
        .map((portal) => ({
          portalId: portal.id,
          portalName: portal.name,
          reason: !portal.enabled ? 'Portal is paused.' : 'Complete its connector setup before collection.'
        }));
      if (!runnable.length) {
        return send(res, 409, { error: 'None of the selected portals has a ready automated connector.', skipped });
      }
      const jobs = [];
      for (const portal of runnable) {
        const jobId = randomUUID();
        void runCollection(portal, jobId).catch((error) => console.error(`${portal.name} collection failed:`, error));
        jobs.push(mapJob(db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(jobId)));
      }
      return send(res, 200, { jobs, skipped });
    }
    if (req.method === 'POST' && url.pathname === '/api/portals') {
      const input = await body(req);
      if (!input.name || !input.baseUrl) return send(res, 400, { error: 'Name and portal URL are required.' });
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(`INSERT INTO portals (id, name, portal_type, base_url, connector_key, enabled, is_primary,
        cadence, status, settings_json, provider, organization_name, account_scope, opportunity_group,
        auth_mode, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, String(input.name).slice(0, 120), String(input.portalType || 'Local agency'), String(input.baseUrl).slice(0, 500),
          String(input.connectorKey || 'manual'), input.enabled === false ? 0 : 1, String(input.cadence || 'Manual'),
          input.enabled === false ? 'Paused' : 'Ready', String(input.provider || 'custom'),
          String(input.organizationName || input.name).slice(0, 160), String(input.accountScope || 'agency'),
          input.opportunityGroup === 'caleprocure' ? 'caleprocure' : 'priority',
          String(input.authMode || 'public'), now, now);
      return send(res, 201, { portal: mapPortal(db.prepare('SELECT * FROM portals WHERE id = ?').get(id)) });
    }
    const portalMatch = url.pathname.match(/^\/api\/portals\/([^/]+)$/);
    if (portalMatch && req.method === 'PATCH') {
      const input = await body(req);
      const allowed = {
        name: 'name', portalType: 'portal_type', baseUrl: 'base_url', connectorKey: 'connector_key',
        enabled: 'enabled', cadence: 'cadence', provider: 'provider', organizationName: 'organization_name',
        accountScope: 'account_scope', opportunityGroup: 'opportunity_group', authMode: 'auth_mode'
      };
      const entries = Object.entries(allowed).filter(([key]) => input[key] !== undefined)
        .map(([key, column]) => [column, key === 'enabled' ? (input[key] ? 1 : 0) : String(input[key])]);
      if (input.enabled !== undefined) entries.push(['status', input.enabled ? 'Ready' : 'Paused']);
      entries.push(['updated_at', new Date().toISOString()]);
      db.prepare(`UPDATE portals SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`)
        .run(...entries.map(([, value]) => value), portalMatch[1]);
      return send(res, 200, { portal: mapPortal(db.prepare('SELECT * FROM portals WHERE id = ?').get(portalMatch[1])) });
    }
    if (portalMatch && req.method === 'DELETE') {
      const portal = db.prepare('SELECT is_primary FROM portals WHERE id = ?').get(portalMatch[1]);
      if (portal?.is_primary) return send(res, 400, { error: 'The primary Cal eProcure portal cannot be deleted.' });
      db.prepare('DELETE FROM portals WHERE id = ?').run(portalMatch[1]);
      return send(res, 200, { ok: true });
    }
    const collectMatch = url.pathname.match(/^\/api\/portals\/([^/]+)\/collect$/);
    if (collectMatch && req.method === 'POST') {
      const portal = db.prepare('SELECT * FROM portals WHERE id = ?').get(collectMatch[1]);
      if (!portal) return send(res, 404, { error: 'Portal not found.' });
      if (!portal.enabled) return send(res, 400, { error: 'Enable this portal before collecting.' });
      const jobId = randomUUID();
      void runCollection(portal, jobId).catch((error) => console.error(`${portal.name} collection failed:`, error));
      return send(res, 202, { job: mapJob(db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(jobId)) });
    }

    if (url.pathname === '/api/jobs' && !requireManagement(res, user)) return;
    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      return send(res, 200, { jobs: db.prepare('SELECT * FROM collection_jobs ORDER BY started_at DESC LIMIT 100').all().map(mapJob) });
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/attachments') {
      if (!requireManagement(res, user)) return;
      const files = db.prepare(`SELECT f.id, f.file_name fileName, f.size_bytes sizeBytes, f.created_at createdAt,
        o.title context, 'response' kind FROM response_files f JOIN opportunities o ON o.id = f.opportunity_id
        UNION ALL SELECT r.candidate_id id, r.file_name fileName, r.size_bytes sizeBytes, r.created_at createdAt,
        c.full_name context, 'resume' kind FROM candidate_resumes r JOIN candidates c ON c.id = r.candidate_id
        ORDER BY createdAt DESC`).all();
      return send(res, 200, { files });
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/clear-rfo-data') {
      if (user.role !== 'super_admin') return send(res, 403, { error: 'Only Bid manager can clear RFO data.' });
      const input = await body(req);
      if (input.confirmation !== 'CLEAR ALL RFO DATA') {
        return send(res, 400, { error: 'Enter CLEAR ALL RFO DATA to confirm.' });
      }
      const storedFiles = db.prepare('SELECT storage_path FROM response_files UNION ALL SELECT storage_path FROM candidate_resumes').all();
      const cleared = {
        opportunities: Number(db.prepare('SELECT COUNT(*) count FROM opportunities').get().count),
        workflows: Number(db.prepare('SELECT COUNT(*) count FROM bid_workflows').get().count),
        candidates: Number(db.prepare('SELECT COUNT(*) count FROM candidates').get().count),
        responseFiles: Number(db.prepare('SELECT COUNT(*) count FROM response_files').get().count),
        collectionJobs: Number(db.prepare('SELECT COUNT(*) count FROM collection_jobs').get().count)
      };
      db.exec('BEGIN');
      try {
        db.exec(`DELETE FROM response_files;
          DELETE FROM candidates;
          DELETE FROM bid_workflows;
          DELETE FROM opportunities;
          DELETE FROM collection_jobs;`);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      let fileCleanupWarnings = 0;
      for (const storedFile of storedFiles) {
        const targetPath = path.resolve(config.responseFilesPath, storedFile.storage_path);
        try {
          if (targetPath.startsWith(`${path.resolve(config.responseFilesPath)}${path.sep}`) && fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
        } catch {
          fileCleanupWarnings += 1;
        }
      }
      return send(res, 200, {
        ok: true,
        cleared,
        preserved: {
          users: Number(db.prepare('SELECT COUNT(*) count FROM users').get().count),
          portals: Number(db.prepare('SELECT COUNT(*) count FROM portals').get().count),
          settings: Number(db.prepare('SELECT COUNT(*) count FROM settings').get().count)
        },
        fileCleanupWarnings
      });
    }
    if (url.pathname === '/api/settings' && !requireManagement(res, user)) return;
    if (req.method === 'GET' && url.pathname === '/api/settings') {
      const row = db.prepare(`SELECT value_json FROM settings WHERE key = 'application'`).get();
      return send(res, 200, { settings: JSON.parse(row?.value_json || '{}'), account: { email: user.email } });
    }
    if (req.method === 'PUT' && url.pathname === '/api/settings') {
      const input = await body(req);
      const settings = {
        includedKeywords: Array.from(new Set([
          ...DEFAULT_IT_KEYWORDS,
          ...(Array.isArray(input.includedKeywords) ? input.includedKeywords.map(String) : [])
        ])).slice(0, 300),
        excludedKeywords: Array.from(new Set([
          ...DEFAULT_EXCLUDED_KEYWORDS,
          ...(Array.isArray(input.excludedKeywords) ? input.excludedKeywords.map(String) : [])
        ])).slice(0, 300),
        preferredAgencies: Array.isArray(input.preferredAgencies) ? input.preferredAgencies.map(String).slice(0, 50) : [],
        collectionFrequency: String(input.collectionFrequency || 'daily'),
        emailDigest: Boolean(input.emailDigest),
        deadlineAlerts: Boolean(input.deadlineAlerts)
      };
      db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES ('application', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
        .run(JSON.stringify(settings), new Date().toISOString());
      return send(res, 200, { settings });
    }
    return send(res, 404, { error: 'API route not found.' });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return send(res, status, { error: status >= 500 && config.production ? 'Unexpected server error.' : error instanceof Error ? error.message : 'Unexpected server error.' });
  }
});

server.listen(config.port, () => {
  console.log(`CalTrack API ready at http://localhost:${server.address().port}`);
  if (!config.production && !process.env.ADMIN_EMAIL) {
    console.log('Local logins: superadmin / superadmin123, admin / admin123, user / user123');
  }
});
