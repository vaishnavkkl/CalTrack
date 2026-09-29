import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));

function loadDotEnv(file = path.join(projectRoot, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const production = process.env.NODE_ENV === 'production';
const requiredInProduction = ['ADMIN_USERNAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
const missing = requiredInProduction.filter((key) => !process.env[key]);
if (production && missing.length) {
  throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
}
if (production && process.env.ADMIN_PASSWORD.length < 16) {
  throw new Error('ADMIN_PASSWORD must contain at least 16 characters in production.');
}

export const config = {
  port: Number(process.env.PORT || 8787),
  dbPath: path.resolve(projectRoot, process.env.DB_PATH || './data/caltrack.db'),
  responseFilesPath: path.resolve(projectRoot, process.env.RESPONSE_FILES_PATH || './data/response-files'),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  adminUsername: process.env.ADMIN_USERNAME || 'superadmin',
  adminEmail: process.env.ADMIN_EMAIL || 'owner@caltrack.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'superadmin123',
  sessionSecret: process.env.SESSION_SECRET || 'development-only-session-secret',
  caleProcureTimeoutMs: Number(process.env.CALEPROCURE_TIMEOUT_MS || 30000),
  integrationApiKey: process.env.INTEGRATION_API_KEY || '',
  production
};
