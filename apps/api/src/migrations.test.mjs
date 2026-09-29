import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('two-role migration preserves identities and sourcing restrictions', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const folder = new URL('./migrations/', import.meta.url);
    for (const file of fs.readdirSync(folder).filter((name) => name.endsWith('.sql')).sort()) {
      if (file.startsWith('015')) break;
      db.exec(fs.readFileSync(new URL(file, folder), 'utf8'));
    }
    const insert = db.prepare(`INSERT INTO users
      (email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'salt', ?, '2026-01-01', '2026-01-01')`);
    insert.run('manager@example.test', 'manager', 'admin');
    insert.run('owner@example.test', 'owner', 'super_admin');
    insert.run('member@example.test', 'member', 'sourcing_user');
    const before = db.prepare('SELECT id, email, password_hash FROM users ORDER BY id').all();
    const migration = fs.readFileSync(new URL('015_two_workspace_roles.sql', folder), 'utf8');
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT id, email, password_hash FROM users ORDER BY id').all(), before);
    assert.deepEqual(db.prepare('SELECT role FROM users ORDER BY id').all().map((row) => row.role),
      ['super_admin', 'super_admin', 'sourcing_user']);
    db.exec(migration);
    assert.equal(db.prepare('SELECT count(*) total FROM users').get().total, 3);
  } finally { db.close(); }
});
