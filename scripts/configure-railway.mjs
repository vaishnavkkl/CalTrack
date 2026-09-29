// Sets initial production credentials through stdin, without printing secrets.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const cli = process.argv[2];
const email = process.argv[3];
if (!cli || !email) throw new Error('Usage: node scripts/configure-railway.mjs <railway-executable> <admin-email>');
const folder = path.resolve('artifacts/private');
fs.mkdirSync(folder, { recursive: true });
const secretPath = path.join(folder, 'railway-secrets.json');
const values = fs.existsSync(secretPath) ? JSON.parse(fs.readFileSync(secretPath, 'utf8')) : {
  ADMIN_USERNAME: 'bidmanager', ADMIN_EMAIL: email,
  ADMIN_PASSWORD: randomBytes(24).toString('base64url'), SESSION_SECRET: randomBytes(48).toString('base64url'),
  NODE_ENV: 'production', PORT: '8080', DB_PATH: '/data/caltrack.db', RESPONSE_FILES_PATH: '/data/uploads'
};
fs.writeFileSync(secretPath, JSON.stringify(values, null, 2), { mode: 0o600 });
fs.writeFileSync(path.join(folder, 'hosted-login.txt'), `CalTrack hosted login\nUsername: ${values.ADMIN_USERNAME}\nPassword: ${values.ADMIN_PASSWORD}\n\nKeep this file private. Local demo credentials are not enabled in production.\n`, { mode: 0o600 });
for (const [key, value] of Object.entries(values)) {
  const result = spawnSync(cli, ['variable', 'set', key, '--stdin', '--service', 'caltrack', '--skip-deploys'], {
    input: value, encoding: 'utf8', windowsHide: true, timeout: 60000
  });
  if (result.status !== 0) throw new Error(`Could not configure ${key}; exit ${result.status}. No secret values were printed.`);
  console.log(`Configured ${key}`);
}
