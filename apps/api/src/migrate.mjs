import { config } from './config.mjs';
import { migrate } from './database.mjs';

migrate();
console.log(`Database is up to date: ${config.dbPath}`);
