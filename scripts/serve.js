/**
 * Minimal static server. The page loads src/*.js as ES modules, which browsers
 * refuse to do over file://, so local development needs a server. This is that
 * server and it is deliberately the whole of it: no dependencies, no watch mode,
 * no reload socket. Refresh the tab.
 *
 *   npm start            -> http://localhost:4173
 *   PORT=8080 npm start  -> pick another port
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.md': 'text/plain; charset=utf-8',
};

async function resolveTarget(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(clean).replace(/^([/\\])+/, '');
  const target = resolve(ROOT, relative || 'index.html');

  // Refuse anything that climbs out of the project directory.
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;

  try {
    const info = await stat(target);
    return info.isDirectory() ? join(target, 'index.html') : target;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const target = await resolveTarget(request.url ?? '/');
  if (!target) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`Not found: ${request.url}`);
    return;
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(String(error));
  }
});

server.listen(PORT, () => {
  console.log(`Fast Weights, Fixed Memory — http://localhost:${PORT}`);
  console.log('Ctrl+C to stop.');
});
