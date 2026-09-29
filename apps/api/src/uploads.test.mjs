import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { decodeResume, MAX_RESUME_BYTES } from './resumes.mjs';

test('resume validation rejects disguised and oversized uploads', () => {
  assert.throws(() => decodeResume({ name: 'malware.exe', data: 'YWJj' }), /PDF/);
  assert.throws(() => decodeResume({ name: 'resume.pdf', data: Buffer.from('<script>bad</script>').toString('base64') }), /contents/);
  assert.throws(() => decodeResume({ name: 'resume.pdf', data: 'A'.repeat(Math.ceil(MAX_RESUME_BYTES / 3) * 4 + 4) }), /5 MB/);
  assert.equal(decodeResume({ name: '../../resume.pdf', data: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') }).name, 'resume.pdf');
});

test('production serves web, protects resumes, and deletes stored files without deleting profiles', { timeout: 45000 }, async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'caltrack-upload-test-'));
  const password = randomBytes(20).toString('hex');
  const dbPath = path.join(folder, 'test.db');
  const uploads = path.join(folder, 'uploads');
  let child, database;
  let logs = '';
  const start = async () => {
    child = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], { windowsHide: true, env: { ...process.env,
      NODE_ENV: 'production', PORT: '0', DB_PATH: dbPath, RESPONSE_FILES_PATH: uploads,
      ADMIN_USERNAME: 'testmanager', ADMIN_EMAIL: 'manager@example.test', ADMIN_PASSWORD: password,
      SESSION_SECRET: randomBytes(32).toString('hex') }, stdio: ['ignore', 'pipe', 'pipe'] });
    logs = '';
    child.stdout.on('data', (chunk) => { logs += chunk; });
    child.stderr.on('data', (chunk) => { logs += chunk; });
    for (let i = 0; i < 100; i++) {
      const match = logs.match(/ready at http:\/\/localhost:(\d+)/);
      if (match) return `http://127.0.0.1:${match[1]}`;
      if (child.exitCode !== null) throw new Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`API failed to start: ${logs}`);
  };
  const stop = async () => { if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } };
  try {
    let origin = await start();
    const request = (route, method = 'GET', payload, cookie) => fetch(origin + '/api' + route, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });
    const login = async (identifier) => {
      const result = await request('/auth/login', 'POST', { identifier, password }); assert.equal(result.status, 200);
      return result.headers.get('set-cookie').split(';')[0];
    };
    const publicPage = await fetch(origin + '/response-review');
    assert.equal(publicPage.status, 200);
    assert.match(publicPage.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(publicPage.headers.get('strict-transport-security'), /max-age=/);
    assert.match(await (await fetch(origin + '/response-review')).text(), /<html/);
    assert.equal((await fetch(origin + '/missing.js')).status, 404);
    assert.equal((await request('/settings/attachments')).status, 401);
    assert.equal((await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    database = new DatabaseSync(dbPath); database.exec('PRAGMA foreign_keys = ON');
    const now = new Date().toISOString();
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    for (const username of ['member', 'other']) database.prepare(`INSERT INTO users (username, email, password_hash, password_salt, role, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'sourcing_user', ?, ?, ?)`).run(username, `${username}@example.test`, hash, salt, username, now, now);
    database.prepare(`INSERT INTO opportunities (id, title, agency, category, source_portal, first_collected_at, last_checked_at, last_updated_at)
      VALUES ('test', 'Software engineering services', 'Test agency', 'IT Services', 'Test', ?, ?, ?)`).run(now, now, now);
    database.prepare(`UPDATE bid_workflows SET decision = 'Qualified', sourcing_status = 'Open', sourcing_brief = 'Software developer',
      required_resources_json = ? WHERE opportunity_id = 'test'`).run(JSON.stringify([{ id: 'developer', title: 'Developer' }]));
    const manager = await login('testmanager'), member = await login('member'), other = await login('other');
    for (let attempt = 0; attempt < 10; attempt++) {
      assert.equal((await request('/auth/login', 'POST', { identifier: 'other', password: 'wrong' })).status, 401);
    }
    const blocked = await request('/auth/login', 'POST', { identifier: 'other', password });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    const payload = { opportunityId: 'test', resourceRequirementId: 'developer', fullName: 'Test Candidate', qualificationSummary: 'Experienced developer',
      resume: { name: 'Résumé.pdf', data: Buffer.from('%PDF-1.4\nTest resume\n%%EOF').toString('base64') } };
    const create = async (data = payload) => {
      const result = await request('/candidates', 'POST', data, member); assert.equal(result.status, 201, await result.clone().text());
      return (await result.json()).candidate;
    };
    const candidate = await create();
    const route = `/candidates/${candidate.id}/resume`;
    assert.equal((await request(route, 'GET', undefined, other)).status, 404);
    assert.equal((await request(route, 'DELETE', undefined, other)).status, 404);
    assert.equal((await request('/settings/attachments', 'GET', undefined, member)).status, 403);
    const download = await request(route, 'GET', undefined, manager);
    assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /attachment/);
    assert.equal(await download.text(), '%PDF-1.4\nTest resume\n%%EOF');
    assert.equal((await request(route, 'GET', undefined, member)).status, 200);
    const list = await (await request('/settings/attachments', 'GET', undefined, manager)).json();
    assert.equal(list.files.length, 1); assert.equal(list.files[0].kind, 'resume');
    const rejected = await request('/candidates', 'POST', { ...payload, resume: { name: 'bad.pdf', data: 'YWJj' } }, member);
    assert.equal(rejected.status, 400); assert.equal(database.prepare('SELECT count(*) n FROM candidates').get().n, 1);
    assert.equal(fs.readdirSync(uploads).length, 1);
    await stop(); origin = await start(); // Persistent volume paths survive service restart.
    const managerAgain = await login('testmanager');
    assert.equal((await request(route, 'GET', undefined, managerAgain)).status, 200);
    assert.equal((await request(route, 'DELETE', undefined, managerAgain)).status, 200);
    assert.equal(fs.readdirSync(uploads).length, 0);
    assert.equal(database.prepare('SELECT count(*) n FROM candidates').get().n, 1);
    const memberAgain = await login('member');
    const next = await request('/candidates', 'POST', payload, memberAgain); assert.equal(next.status, 201);
    assert.equal((await request('/settings/clear-rfo-data', 'POST', { confirmation: 'wrong' }, managerAgain)).status, 400);
    assert.equal((await request('/settings/clear-rfo-data', 'POST', { confirmation: 'CLEAR ALL RFO DATA' }, memberAgain)).status, 403);
    assert.equal(fs.readdirSync(uploads).length, 1);
    assert.equal((await request('/settings/clear-rfo-data', 'POST', { confirmation: 'CLEAR ALL RFO DATA' }, managerAgain)).status, 200);
    assert.equal(fs.readdirSync(uploads).length, 0);
    assert.equal(database.prepare('SELECT count(*) n FROM candidate_resumes').get().n, 0);
    assert.equal(database.prepare('SELECT count(*) n FROM users').get().n, 3);
  } finally { database?.close(); await stop(); fs.rmSync(folder, { recursive: true, force: true }); }
});
