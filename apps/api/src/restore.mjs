import fs from 'node:fs';
import path from 'node:path';
import { config, projectRoot } from './config.mjs';

const source = process.argv[2] ? path.resolve(projectRoot, process.argv[2]) : '';
if (!source || !fs.existsSync(source)) {
  throw new Error('Provide an existing backup path: npm run db:restore -- backups/caltrack-….db');
}
const header = Buffer.alloc(16);
const handle = fs.openSync(source, 'r');
fs.readSync(handle, header, 0, 16, 0);
fs.closeSync(handle);
if (header.toString('utf8') !== 'SQLite format 3\0') {
  throw new Error('The selected file is not a valid SQLite database.');
}
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.copyFileSync(source, config.dbPath);
console.log(`Database restored from: ${source}`);
