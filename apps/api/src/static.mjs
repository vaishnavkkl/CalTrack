import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './config.mjs';

const root = path.join(projectRoot, 'apps/web/dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
export function serveWeb(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400); res.end(); return; }
  const candidate = path.resolve(root, `.${decoded}`);
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) { res.writeHead(404); res.end(); return; }
  let file = candidate;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (path.extname(decoded)) { res.writeHead(404); res.end(); return; }
    file = path.join(root, 'index.html');
  }
  if (!fs.existsSync(file)) { res.writeHead(503); res.end('Frontend build unavailable. Run npm run build.'); return; }
  res.writeHead(200, {
    'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}
