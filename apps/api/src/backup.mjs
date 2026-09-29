import fs from 'node:fs';
import path from 'node:path';
import { config, projectRoot } from './config.mjs';

if (!fs.existsSync(config.dbPath)) {
  throw new Error(`Database not found: ${config.dbPath}`);
}
const destinationDirectory = path.join(projectRoot, 'backups');
fs.mkdirSync(destinationDirectory, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const destination = path.join(destinationDirectory, `caltrack-${stamp}.db`);
fs.copyFileSync(config.dbPath, destination, fs.constants.COPYFILE_EXCL);
console.log(`Backup created: ${destination}`);
if (fs.existsSync(config.responseFilesPath)) {
  const filesDestination = path.join(destinationDirectory, `caltrack-${stamp}-response-files`);
  fs.cpSync(config.responseFilesPath, filesDestination, { recursive: true, errorOnExist: true });
  console.log(`Response files backup created: ${filesDestination}`);
}
