// Storymaps.io — AGPL-3.0 — see LICENCE for details
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import Database from 'better-sqlite3';

// Use createRequire to get the same CJS Yjs instance as y-websocket/bin/utils.cjs
// (avoids dual-instance issues when mixing ESM import with CJS require)
const _require = createRequire(import.meta.url);
const Y = _require('yjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;
const DATA_DIR = join(__dirname, 'data');

// Allowed origins for API writes and WebSocket connections
// localhost is always allowed for development
const ALLOWED_ORIGINS = new Set([
  'https://storymaps.io',
  'https://www.storymaps.io',
  'https://new.storymaps.io',
]);

const isOriginAllowed = (origin) => {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow localhost/127.0.0.1 for development
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

// Set YPERSISTENCE *before* importing y-websocket utils, which reads it at load time
process.env.YPERSISTENCE = DATA_DIR;
const { setupWSConnection, docs, getPersistence } = await import('y-websocket/bin/utils');

import { jsonToYamlObj, dumpYaml, importFromYaml } from './src/yaml.js';
import { exportToCsv } from './src/csv.js';
import jsyaml from '#js-yaml';

// Rate limiter: sliding window, 30 req/min per IP
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;
const rateLimitMap = new Map();

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress;
};

const isRateLimited = (req) => {
  const ip = getClientIp(req);
  const now = Date.now();
  let timestamps = rateLimitMap.get(ip);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(ip, timestamps);
  }
  // Remove expired entries
  while (timestamps.length && timestamps[0] <= now - RATE_WINDOW) timestamps.shift();
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  return false;
};

// Proxy export rate limiter: 5 req/min per IP
const PROXY_RATE_LIMIT = 5;
const proxyRateLimitMap = new Map();

const isProxyRateLimited = (req) => {
  const ip = getClientIp(req);
  const now = Date.now();
  let timestamps = proxyRateLimitMap.get(ip);
  if (!timestamps) {
    timestamps = [];
    proxyRateLimitMap.set(ip, timestamps);
  }
  while (timestamps.length && timestamps[0] <= now - RATE_WINDOW) timestamps.shift();
  if (timestamps.length >= PROXY_RATE_LIMIT) return true;
  timestamps.push(now);
  return false;
};

// SSRF protection: only allow HTTPS to public hosts
// Set DISABLE_SSRF_CHECK=1 in .env for local development
const DISABLE_SSRF_CHECK = process.env.DISABLE_SSRF_CHECK === '1';

const validateExternalUrl = (input) => {
  if (!input) return null;
  try {
    const prefixed = input.startsWith('http://') || input.startsWith('https://') ? input : 'https://' + input;
    const url = new URL(prefixed);
    if (!DISABLE_SSRF_CHECK && url.protocol !== 'https:') return null;
    if (DISABLE_SSRF_CHECK) return url.origin;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
    if (host.includes('::ffff:')) return null;
    if (host.endsWith('.local') || host.endsWith('.internal')) return null;
    // Block RFC1918 / link-local ranges
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every(n => n >= 0 && n <= 255)) {
      if (parts[0] === 10) return null;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return null;
      if (parts[0] === 192 && parts[1] === 168) return null;
      if (parts[0] === 169 && parts[1] === 254) return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

const sendSSE = (res, event, data) => {
  if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const fetchWithTimeout = (url, opts, ms = 30_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
};

const safeJson = async (res) => {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`HTTP ${res.status} — expected JSON but got: ${text.slice(0, 200)}`); }
};

// Convert Jira ADF (Atlassian Document Format) to plain text
const adfToPlainText = (node, depth = 0) => {
  if (!node || depth > 20) return '';
  if (node.type === 'text') return node.text || '';
  if (!Array.isArray(node.content)) return '';
  const parts = node.content.slice(0, 500).map(c => adfToPlainText(c, depth + 1));
  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'bulletList' || node.type === 'orderedList') {
    return parts.join('') + '\n';
  }
  if (node.type === 'listItem') return '- ' + parts.join('');
  return parts.join('');
};

// Map Jira statusCategory.key to storymap status
const jiraStatusToStorymaps = (statusCategoryKey) => {
  if (statusCategoryKey === 'done') return 'done';
  if (statusCategoryKey === 'indeterminate') return 'in-progress';
  return 'planned'; // 'new' or anything else
};

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, timestamps] of rateLimitMap) {
    while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
    if (!timestamps.length) rateLimitMap.delete(ip);
  }
  for (const [ip, timestamps] of proxyRateLimitMap) {
    while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
    if (!timestamps.length) proxyRateLimitMap.delete(ip);
  }
}, 5 * 60_000);

// JSON file paths for lock and counter data
const LOCK_FILE = join(DATA_DIR, 'locks.json');
const STATS_FILE = join(DATA_DIR, 'stats.json');
const BACKUPS_DIR = join(DATA_DIR, 'backups');
const getBackupFile = (mapId) => join(BACKUPS_DIR, mapId + '.json');

// =============================================================================
// Data Helpers
// =============================================================================

const ensureDataDir = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(BACKUPS_DIR, { recursive: true });
};

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath, data) => {
  await writeFile(filePath, JSON.stringify(data, null, 2));
};

// =============================================================================
// Static File Config
// =============================================================================

const PUBLIC_DIR = join(__dirname, 'public');
const SRC_DIR = join(__dirname, 'src');
const STATIC_DIRS = [PUBLIC_DIR, SRC_DIR];

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.yaml': 'text/yaml',
  '.csv': 'text/csv',
};

const sanitizeFilename = (name) =>
  (name || '').toLowerCase().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/^\.+/, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').substring(0, 200) || 'story-map';

// Extensions worth gzipping (text-based formats)
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt']);

// In-memory static file cache: path → { etag, raw, gzipped, contentType, cacheControl }
const fileCache = new Map();

// Cache strategy: short cache for code (CDN/browser + ETag revalidation), long cache for assets
const cacheHeader = (ext) => {
  if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'].includes(ext)) {
    return 'public, max-age=86400'; // Images/fonts: 1 day
  }
  return 'public, max-age=10, must-revalidate'; // HTML/JS/CSS: 10s cache, then ETag revalidation
};

// =============================================================================
// REST API Handlers
// =============================================================================

const handleApi = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Check origin for write requests (skip for CLI API routes — rate-limited instead)
  const isCliApi = /^\/api\/(maps(\/[a-z0-9]+)?|lock\/[a-z0-9]+(\/(?:unlock|remove))?)$/.test(path) && ['POST', 'PUT'].includes(req.method);
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !isCliApi && !isOriginAllowed(req.headers.origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  // Parse body for POST/PUT/DELETE (5 MB limit)
  let body = null;
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const MAX_BODY = 5_242_880;
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    const isYaml = contentType.includes('text/yaml') || contentType.includes('application/x-yaml');
    body = await new Promise((resolve, reject) => {
      let data = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { req.destroy(); reject(new Error('Body too large')); return; }
        data += chunk;
      });
      req.on('end', () => {
        if (!data.trim()) { resolve({}); return; }
        try {
          if (isYaml) {
            resolve(importFromYaml(data));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) {
          if (isYaml && e.validationErrors) {
            const err = new Error('YAML validation failed');
            err.validationErrors = e.validationErrors;
            err.validationWarnings = e.validationWarnings;
            reject(err);
          } else {
            resolve({});
          }
        }
      });
      req.on('error', reject);
    }).catch((e) => {
      if (e.validationErrors) return e; // Pass validation errors through
      return null;
    });
    if (body === null && req.destroyed) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return;
    }
    if (body?.validationErrors) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'YAML validation failed', errors: body.validationErrors, warnings: body.validationWarnings || [] }));
      return;
    }
  }

  // --- Lock API ---
  // GET /api/lock/:mapId — returns { isLocked } only, never the hash
  // POST /api/lock/:mapId — lock with { passwordHash }
  const lockMatch = path.match(/^\/api\/lock\/([a-z0-9]+)$/);
  if (lockMatch) {
    const mapId = lockMatch[1];
    const locks = await readJson(LOCK_FILE, {});

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ isLocked: !!locks[mapId]?.isLocked }));
      return;
    }

    if (req.method === 'POST') {
      if (!body.passwordHash) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Password hash required' }));
        return;
      }
      locks[mapId] = {
        isLocked: true,
        passwordHash: body.passwordHash,
        lockedAt: Date.now(),
      };
      await writeJson(LOCK_FILE, locks);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ isLocked: true }));
      return;
    }
  }

  // POST /api/lock/:mapId/unlock — verify hash server-side
  const unlockMatch = path.match(/^\/api\/lock\/([a-z0-9]+)\/unlock$/);
  if (unlockMatch && req.method === 'POST') {
    const mapId = unlockMatch[1];
    const locks = await readJson(LOCK_FILE, {});
    const lock = locks[mapId];

    if (!lock?.isLocked) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const ok = body.passwordHash === lock.passwordHash;
    res.writeHead(ok ? 200 : 403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok }));
    return;
  }

  // POST /api/lock/:mapId/remove — verify hash then delete lock
  const removeMatch = path.match(/^\/api\/lock\/([a-z0-9]+)\/remove$/);
  if (removeMatch && req.method === 'POST') {
    const mapId = removeMatch[1];
    const locks = await readJson(LOCK_FILE, {});
    const lock = locks[mapId];

    if (!lock?.isLocked) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (body.passwordHash !== lock.passwordHash) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Incorrect password' }));
      return;
    }
    delete locks[mapId];
    await writeJson(LOCK_FILE, locks);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- Map ID API ---
  if (path === '/api/maps/new-id' && req.method === 'GET') {
    try {
      const id = generateUniqueMapId();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ id }));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate unique ID' }));
    }
    return;
  }

  // --- CLI Map API ---
  // POST /api/maps — create a new map
  if (path === '/api/maps' && req.method === 'POST') {
    if (isRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
      return;
    }
    try {
      const id = generateUniqueMapId();
      const now = new Date().toISOString();

      // If body has map data, write it to Yjs + persist to LevelDB
      const hasData = body.steps?.length || body.slices?.length;
      if (hasData) {
        const doc = new Y.Doc();
        writeDocFromJson(doc, body, Y);
        appendLogEntry(doc, 'Created map via CLI');
        const persistence = getPersistence();
        if (persistence) {
          await persistence.provider.storeUpdate(id, Y.encodeStateAsUpdate(doc));
        }
        doc.destroy();
      }

      // Create SQLite entry + increment stats
      stmtInsert.run(id, body.name || 'untitled', now, now);
      const stats = await readJson(STATS_FILE, { mapCount: 0 });
      stats.mapCount = (stats.mapCount || 0) + 1;
      await writeJson(STATS_FILE, stats);

      const site = (req.headers.host || '').replace(/:\d+$/, '');
      const proto = req.headers['x-forwarded-proto'] || 'http';
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, url: `${proto}://${site}/${id}`, created_at: now }));
    } catch (err) {
      console.error('POST /api/maps error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create map' }));
    }
    return;
  }

  // GET /api/maps/:id — pull map data
  const getMapMatch = path.match(/^\/api\/maps\/([a-z0-9]+)$/);
  if (getMapMatch && req.method === 'GET') {
    const mapId = getMapMatch[1];
    const data = await loadAndSerialize(mapId, req.headers.host);
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Map not found' }));
      return;
    }
    // Strip backups from API response
    const { backups, ...clean } = data;
    const etag = contentEtag(data);
    const format = url.searchParams.get('format');
    if (format === 'yaml') {
      const yamlStr = dumpYaml(jsonToYamlObj(clean));
      res.writeHead(200, { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache', 'ETag': etag });
      res.end(yamlStr);
    } else if (format === 'csv') {
      const csvStr = exportToCsv(clean);
      const fn = sanitizeFilename(clean.name) + '.csv';
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fn}"`, 'Cache-Control': 'no-cache', 'ETag': etag });
      res.end(csvStr);
    } else {
      const jsonBody = JSON.stringify(clean, null, 2);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'ETag': etag });
      res.end(jsonBody);
    }
    return;
  }

  // GET /api/maps/:id/log — activity log entries
  const logMatch = path.match(/^\/api\/maps\/([a-z0-9]+)\/log$/);
  if (logMatch && req.method === 'GET') {
    const mapId = logMatch[1];
    let doc = docs.get(mapId);
    let created = false;
    if (!doc) {
      const persistence = getPersistence();
      if (!persistence) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Persistence unavailable' }));
        return;
      }
      doc = new Y.Doc();
      await persistence.bindState(mapId, doc);
      created = true;
    }
    // Check if map has any data (empty doc = map not found)
    const ymap = doc.getMap('storymap');
    if (ymap.size === 0) {
      if (created) doc.destroy();
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Map not found' }));
      return;
    }
    const entries = doc.getArray('log').toArray().reverse();
    if (created) doc.destroy();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(entries));
    return;
  }

  // PUT /api/maps/:id — push map data
  const putMapMatch = path.match(/^\/api\/maps\/([a-z0-9]+)$/);
  if (putMapMatch && req.method === 'PUT') {
    if (isRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
      return;
    }
    const mapId = putMapMatch[1];

    // Validate body
    if (!body.steps?.length && !body.slices?.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Body must contain steps or slices' }));
      return;
    }

    // Check lock (X-Lock-Password header bypasses if it matches the hash)
    const locks = await readJson(LOCK_FILE, {});
    if (locks[mapId]?.isLocked) {
      const lockPassword = req.headers['x-lock-password'];
      if (!lockPassword || lockPassword !== locks[mapId].passwordHash) {
        res.writeHead(423, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Map is locked' }));
        return;
      }
    }

    // ETag conflict detection (opt-in via If-Match header)
    const ifMatch = req.headers['if-match'];
    if (ifMatch) {
      const current = await loadAndSerialize(mapId, req.headers.host);
      if (current) {
        const currentEtag = contentEtag(current);
        if (ifMatch !== currentEtag) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Conflict: map has been modified since last pull. Pull again to get the latest version.' }));
          return;
        }
      }
    }

    try {
      const existingDoc = docs.get(mapId);

      if (existingDoc) {
        // Doc is in-memory (active WS clients) — write directly, changes broadcast automatically
        const oldSnapshot = serializeDoc(existingDoc);
        writeDocFromJson(existingDoc, body, Y);
        const result = diffPush(oldSnapshot, body, existingDoc);
        if (result) appendLogEntry(existingDoc, result.text, result.ids);
      } else {
        // Doc not in-memory — load from LevelDB, write, persist
        const persistence = getPersistence();
        if (!persistence) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Persistence unavailable' }));
          return;
        }
        const doc = new Y.Doc();
        await persistence.bindState(mapId, doc);
        const oldSnapshot = serializeDoc(doc);
        writeDocFromJson(doc, body, Y);
        const result = diffPush(oldSnapshot, body, doc);
        if (result) appendLogEntry(doc, result.text, result.ids);
        await persistence.provider.storeUpdate(mapId, Y.encodeStateAsUpdate(doc));
        doc.destroy();
      }

      // Upsert SQLite entry
      const now = new Date().toISOString();
      if (stmtExists.get(mapId)) {
        stmtUpdate.run(body.name || 'untitled', now, mapId);
      } else {
        stmtInsert.run(mapId, body.name || 'untitled', now, now);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: mapId, updated_at: now }));
    } catch (err) {
      console.error(`PUT /api/maps/${mapId} error:`, err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update map' }));
    }
    return;
  }

  // --- Stats API ---
  if (path === '/api/stats') {
    const stats = await readJson(STATS_FILE, { mapCount: 0 });

    if (req.method === 'GET') {
      let activeUsers = 0;
      for (const [, doc] of docs) {
        activeUsers += doc.awareness.getStates().size;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ ...stats, activeUsers }));
      return;
    }

    if (req.method === 'POST') {
      stats.mapCount = (stats.mapCount || 0) + 1;
      await writeJson(STATS_FILE, stats);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(stats));
      return;
    }
  }

  // --- Backups API ---
  // GET /api/backups/:mapId — list backup metadata
  // POST /api/backups/:mapId — create a new backup
  const backupsMatch = path.match(/^\/api\/backups\/([a-z0-9]+)$/);
  if (backupsMatch) {
    const mapId = backupsMatch[1];

    if (req.method === 'GET') {
      const backups = await readJson(getBackupFile(mapId), []);
      const meta = backups.map(b => ({
        id: b.id, timestamp: b.timestamp, note: b.note,
        mapName: b.mapName || '',
        size: b.data ? b.data.length : 0,
        cardCount: b.cardCount || 0,
        ...(b.imported && { imported: true }),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(meta));
      return;
    }

    if (req.method === 'POST') {
      const data = await loadAndSerialize(mapId, req.headers.host);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Map not found' }));
        return;
      }
      // Strip metadata fields from the snapshot
      const { id, site, locked, exported, backups: _b, ...snapshot } = data;
      const backups = await readJson(getBackupFile(mapId), []);
      const entry = {
        id: randomBytes(6).toString('hex'),
        timestamp: new Date().toISOString(),
        note: body?.note || '',
        mapName: snapshot.name || '',
        cardCount: countCards(snapshot),
        data: JSON.stringify(snapshot),
      };
      backups.push(entry);
      if (backups.length > 5) backups.splice(0, backups.length - 5);
      await writeJson(getBackupFile(mapId), backups);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: entry.id, timestamp: entry.timestamp, note: entry.note, mapName: entry.mapName, size: entry.data.length, cardCount: entry.cardCount }));
      return;
    }
  }

  // GET /api/backups/:mapId/:backupId — fetch single backup data
  // DELETE /api/backups/:mapId/:backupId — delete a single backup
  const backupItemMatch = path.match(/^\/api\/backups\/([a-z0-9]+)\/([a-f0-9]+)$/);
  if (backupItemMatch) {
    const mapId = backupItemMatch[1];
    const backupId = backupItemMatch[2];
    const backups = await readJson(getBackupFile(mapId), []);
    const idx = backups.findIndex(b => b.id === backupId);

    if (req.method === 'GET') {
      if (idx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backup not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(backups[idx]));
      return;
    }

    if (req.method === 'DELETE') {
      if (idx !== -1) {
        backups.splice(idx, 1);
        await writeJson(getBackupFile(mapId), backups);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
  }

  // POST /api/backups/:mapId/import — import backups from exported data
  const backupImportMatch = path.match(/^\/api\/backups\/([a-z0-9]+)\/import$/);
  if (backupImportMatch && req.method === 'POST') {
    const mapId = backupImportMatch[1];
    const imported = Array.isArray(body?.backups) ? body.backups : [];
    if (imported.length) {
      const existing = await readJson(getBackupFile(mapId), []);
      const existingIds = new Set(existing.map(b => b.id));
      for (const b of imported) {
        if (b.id && b.data && !existingIds.has(b.id)) existing.push({ ...b, imported: true });
      }
      if (existing.length > 5) existing.splice(0, existing.length - 5);
      await writeJson(getBackupFile(mapId), existing);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ==========================================================================
  // Proxy Export Verify Endpoints
  // ==========================================================================

  // POST /api/export/jira/verify — verify Jira credentials
  if (path === '/api/export/jira/verify' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { instanceUrl, email, token } = body;
    if (!instanceUrl || !email || !token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing required fields: instanceUrl, email, token' }));
      return;
    }
    const origin = validateExternalUrl(instanceUrl);
    if (!origin) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid instance URL. Must be HTTPS and a public host.' }));
      return;
    }
    try {
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const r = await fetchWithTimeout(`${origin}/rest/api/3/myself`, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
      }, 10_000);
      const data = await safeJson(r);
      if (r.status === 401 || r.status === 403 || data.errorMessages?.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: data.errorMessages?.[0] || 'Authentication failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, displayName: data.displayName || data.emailAddress || 'Unknown' }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Connection failed: ${e.message}` }));
    }
    return;
  }

  // POST /api/export/phabricator/verify — verify Phabricator credentials
  if (path === '/api/export/phabricator/verify' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { instanceUrl, token } = body;
    if (!instanceUrl || !token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing required fields: instanceUrl, token' }));
      return;
    }
    const origin = validateExternalUrl(instanceUrl);
    if (!origin) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid instance URL. Must be HTTPS and a public host.' }));
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set('api.token', token);
      const r = await fetchWithTimeout(`${origin}/api/user.whoami`, {
        method: 'POST',
        headers: { 'User-Agent': 'Storymaps.io/1.0' },
        body: params
      }, 10_000);
      const data = await safeJson(r);
      if (data.error_code) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: data.error_info || 'Authentication failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, userName: data.result?.userName || data.result?.realName || 'Unknown' }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Connection failed: ${e.message}` }));
    }
    return;
  }

  // POST /api/export/asana/verify — verify Asana credentials
  if (path === '/api/export/asana/verify' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { token } = body;
    if (!token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing required field: token' }));
      return;
    }
    try {
      const r = await fetchWithTimeout('https://app.asana.com/api/1.0/users/me', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }, 10_000);
      const data = await safeJson(r);
      if (r.status === 401 || r.status === 403 || data.errors?.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: data.errors?.[0]?.message || 'Authentication failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: data.data?.name || data.data?.email || 'Unknown' }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Connection failed: ${e.message}` }));
    }
    return;
  }

  // POST /api/export/linear/verify — verify Linear API key
  if (path === '/api/export/linear/verify' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { apiKey } = body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length > 256) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing or invalid API key' }));
      return;
    }
    try {
      const r = await fetchWithTimeout('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: '{ viewer { id name email } }' })
      }, 10_000);
      const data = await safeJson(r);
      if (r.status === 401 || r.status === 403 || data.errors?.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: data.errors?.[0]?.message || 'Authentication failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: data.data?.viewer?.name || data.data?.viewer?.email || 'Unknown' }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Connection failed: ${e.message}` }));
    }
    return;
  }

  // ==========================================================================
  // Proxy Export Endpoints (SSE streams)
  // ==========================================================================

  // POST /api/export/jira — create epics + stories via Jira REST API
  if (path === '/api/export/jira' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { instanceUrl, email, token, projectKey, epics } = body;
    if (!instanceUrl || !email || !token || !projectKey || !Array.isArray(epics)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: instanceUrl, email, token, projectKey, epics' }));
      return;
    }
    const totalStories = epics.reduce((n, e) => n + (e.stories?.length || 0), 0);
    if (epics.length > 200 || totalStories > 2000) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many items. Max 200 epics and 2000 stories.' }));
      return;
    }
    if (!/^[A-Z0-9_]{1,50}$/i.test(projectKey)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid projectKey. Must be 1-50 alphanumeric/underscore characters.' }));
      return;
    }
    const origin = validateExternalUrl(instanceUrl);
    if (!origin) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid instance URL. Must be HTTPS and a public host.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };
    const apiUrl = `${origin}/rest/api/3/issue`;
    let created = 0, failed = 0;
    for (const epic of epics) {
      sendSSE(res, 'progress', { type: 'epic', summary: epic.summary, status: 'creating' });
      let epicData;
      try {
        const epicRes = await fetchWithTimeout(apiUrl, {
          method: 'POST', headers,
          body: JSON.stringify({
            fields: {
              project: { key: projectKey },
              summary: epic.summary,
              description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: epic.description || 'Imported from Storymaps.io' }] }] },
              issuetype: { name: 'Epic' }
            }
          })
        });
        epicData = await safeJson(epicRes);
      } catch (e) {
        sendSSE(res, 'progress', { type: 'epic', summary: epic.summary, status: 'error', error: e.message });
        failed++;
        continue;
      }
      if (epicData.errors || epicData.errorMessages?.length) {
        sendSSE(res, 'progress', { type: 'epic', summary: epic.summary, status: 'error', error: epicData.errors || epicData.errorMessages });
        failed++;
        continue;
      }
      sendSSE(res, 'progress', { type: 'epic', summary: epic.summary, status: 'created', key: epicData.key });
      created++;
      for (const story of (epic.stories || [])) {
        sendSSE(res, 'progress', { type: 'story', summary: story.summary, parent: epicData.key, status: 'creating' });
        try {
          const storyRes = await fetchWithTimeout(apiUrl, {
            method: 'POST', headers,
            body: JSON.stringify({
              fields: {
                project: { key: projectKey },
                summary: story.summary,
                description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: story.description || 'Imported from Storymaps.io' }] }] },
                issuetype: { name: 'Story' },
                parent: { key: epicData.key }
              }
            })
          });
          const storyData = await safeJson(storyRes);
          if (storyData.errors || storyData.errorMessages?.length) {
            sendSSE(res, 'progress', { type: 'story', summary: story.summary, status: 'error', error: storyData.errors || storyData.errorMessages });
            failed++;
          } else {
            sendSSE(res, 'progress', { type: 'story', summary: story.summary, status: 'created', key: storyData.key });
            created++;
          }
        } catch (e) {
          sendSSE(res, 'progress', { type: 'story', summary: story.summary, status: 'error', error: e.message });
          failed++;
        }
      }
    }
    sendSSE(res, 'done', { created, failed });
    res.end();
    return;
  }

  // POST /api/export/phabricator — create tasks via Phabricator Conduit API
  if (path === '/api/export/phabricator' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { instanceUrl, token: phabToken, tags, items } = body;
    if (!instanceUrl || !phabToken || !Array.isArray(items)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: instanceUrl, token, items' }));
      return;
    }
    const totalSubtasks = items.reduce((n, it) => n + (it.subtasks?.length || 0), 0);
    if (items.length > 200 || totalSubtasks > 2000) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many items. Max 200 items and 2000 subtasks.' }));
      return;
    }
    const origin = validateExternalUrl(instanceUrl);
    if (!origin) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid instance URL. Must be HTTPS and a public host.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const apiUrl = `${origin}/api/maniphest.edit`;
    const phabStatusMap = { none: 'open', planned: 'open', 'in-progress': 'progress', done: 'resolved' };
    const userTags = Array.isArray(tags) ? tags : [];
    let created = 0, failed = 0;
    for (const item of items) {
      sendSSE(res, 'progress', { type: 'task', title: item.title, status: 'creating' });
      const params = new URLSearchParams();
      params.set('api.token', phabToken);
      let i = 0;
      params.set(`transactions[${i}][type]`, 'title');
      params.set(`transactions[${i++}][value]`, item.title);
      params.set(`transactions[${i}][type]`, 'description');
      params.set(`transactions[${i++}][value]`, item.description || '');
      if (item.status) {
        params.set(`transactions[${i}][type]`, 'status');
        params.set(`transactions[${i++}][value]`, phabStatusMap[item.status] || 'open');
      }
      const itemTags = item.type === 'epic' ? ['epic', ...userTags] : [...userTags];
      if (itemTags.length) {
        params.set(`transactions[${i}][type]`, 'projects.add');
        itemTags.forEach((tag, j) => params.set(`transactions[${i}][value][${j}]`, tag));
        i++;
      }
      let parentData;
      try {
        const parentRes = await fetchWithTimeout(apiUrl, { method: 'POST', body: params, headers: { 'User-Agent': 'Storymaps.io/1.0' } });
        parentData = await safeJson(parentRes);
      } catch (e) {
        sendSSE(res, 'progress', { type: 'task', title: item.title, status: 'error', error: e.message });
        failed++;
        continue;
      }
      if (parentData.error_code) {
        sendSSE(res, 'progress', { type: 'task', title: item.title, status: 'error', error: parentData.error_info });
        failed++;
        continue;
      }
      const parentPhid = parentData.result.object.phid;
      const parentId = parentData.result.object.id;
      sendSSE(res, 'progress', { type: 'task', title: item.title, status: 'created', id: `T${parentId}` });
      created++;
      for (const sub of (item.subtasks || [])) {
        sendSSE(res, 'progress', { type: 'subtask', title: sub.title, parent: `T${parentId}`, status: 'creating' });
        try {
          const subParams = new URLSearchParams();
          subParams.set('api.token', phabToken);
          let si = 0;
          subParams.set(`transactions[${si}][type]`, 'title');
          subParams.set(`transactions[${si++}][value]`, sub.title);
          subParams.set(`transactions[${si}][type]`, 'description');
          subParams.set(`transactions[${si++}][value]`, sub.description || '');
          if (sub.status) {
            subParams.set(`transactions[${si}][type]`, 'status');
            subParams.set(`transactions[${si++}][value]`, phabStatusMap[sub.status] || 'open');
          }
          subParams.set(`transactions[${si}][type]`, 'parent');
          subParams.set(`transactions[${si++}][value]`, parentPhid);
          if (userTags.length) {
            subParams.set(`transactions[${si}][type]`, 'projects.add');
            userTags.forEach((tag, j) => subParams.set(`transactions[${si}][value][${j}]`, tag));
          }
          const subRes = await fetchWithTimeout(apiUrl, { method: 'POST', body: subParams, headers: { 'User-Agent': 'Storymaps.io/1.0' } });
          const subData = await safeJson(subRes);
          if (subData.error_code) {
            sendSSE(res, 'progress', { type: 'subtask', title: sub.title, status: 'error', error: subData.error_info });
            failed++;
          } else {
            sendSSE(res, 'progress', { type: 'subtask', title: sub.title, status: 'created', id: `T${subData.result.object.id}` });
            created++;
          }
        } catch (e) {
          sendSSE(res, 'progress', { type: 'subtask', title: sub.title, status: 'error', error: e.message });
          failed++;
        }
      }
    }
    sendSSE(res, 'done', { created, failed });
    res.end();
    return;
  }

  // POST /api/export/asana — create tasks via Asana REST API
  if (path === '/api/export/asana' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { token: asanaToken, projectGid, createSections, items } = body;
    if (!asanaToken || !projectGid || !Array.isArray(items)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: token, projectGid, items' }));
      return;
    }
    if (!/^\d+$/.test(projectGid)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid projectGid. Must be numeric.' }));
      return;
    }
    const totalSubtasks = items.reduce((n, it) => n + (it.subtasks?.length || 0), 0);
    if (items.length > 200 || totalSubtasks > 2000) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many items. Max 200 items and 2000 subtasks.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const baseUrl = 'https://app.asana.com/api/1.0';
    const headers = { 'Authorization': `Bearer ${asanaToken}`, 'Content-Type': 'application/json' };
    let created = 0, failed = 0;
    for (const item of items) {
      let sectionGid = null;
      if (createSections) {
        sendSSE(res, 'progress', { type: 'section', name: item.name, status: 'creating' });
        try {
          const secRes = await fetchWithTimeout(`${baseUrl}/projects/${projectGid}/sections`, {
            method: 'POST', headers,
            body: JSON.stringify({ data: { name: item.name } })
          });
          const secData = await safeJson(secRes);
          if (secData.errors) {
            sendSSE(res, 'progress', { type: 'section', name: item.name, status: 'error', error: secData.errors });
          } else {
            sectionGid = secData.data.gid;
            sendSSE(res, 'progress', { type: 'section', name: item.name, status: 'created' });
          }
        } catch (e) {
          sendSSE(res, 'progress', { type: 'section', name: item.name, status: 'error', error: e.message });
        }
      }
      sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'creating' });
      let taskData;
      try {
        const taskBody = {
          data: {
            name: item.name,
            notes: item.notes || 'Imported from Storymaps.io',
            projects: [projectGid],
            completed: item.completed || false
          }
        };
        if (sectionGid) {
          taskBody.data.memberships = [{ project: projectGid, section: sectionGid }];
        }
        const taskRes = await fetchWithTimeout(`${baseUrl}/tasks`, { method: 'POST', headers, body: JSON.stringify(taskBody) });
        taskData = await safeJson(taskRes);
      } catch (e) {
        sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'error', error: e.message });
        failed++;
        continue;
      }
      if (taskData.errors) {
        sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'error', error: taskData.errors });
        failed++;
        continue;
      }
      const parentGid = taskData.data.gid;
      sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'created', gid: parentGid });
      created++;
      for (const sub of (item.subtasks || [])) {
        sendSSE(res, 'progress', { type: 'subtask', name: sub.name, parent: parentGid, status: 'creating' });
        try {
          const subRes = await fetchWithTimeout(`${baseUrl}/tasks/${parentGid}/subtasks`, {
            method: 'POST', headers,
            body: JSON.stringify({
              data: {
                name: sub.name,
                notes: sub.notes || 'Imported from Storymaps.io',
                completed: sub.completed || false
              }
            })
          });
          const subData = await safeJson(subRes);
          if (subData.errors) {
            sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'error', error: subData.errors });
            failed++;
          } else {
            sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'created', gid: subData.data.gid });
            created++;
          }
        } catch (e) {
          sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'error', error: e.message });
          failed++;
        }
      }
    }
    sendSSE(res, 'done', { created, failed });
    res.end();
    return;
  }

  // POST /api/export/linear — create issues via Linear GraphQL API
  if (path === '/api/export/linear' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { apiKey, teamKey, items } = body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length > 256) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid API key' }));
      return;
    }
    if (!teamKey || typeof teamKey !== 'string' || teamKey.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(teamKey)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid team key' }));
      return;
    }
    if (!Array.isArray(items)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required field: items' }));
      return;
    }
    const totalSubIssues = items.reduce((n, it) => n + (it.subissues?.length || 0), 0);
    if (items.length > 200 || totalSubIssues > 2000) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many items. Max 200 parent issues and 2000 sub-issues.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const linearGql = async (query, variables) => {
      const r = await fetchWithTimeout('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      }, 30_000);
      const data = await safeJson(r);
      if (r.status === 401 || r.status === 403) throw new Error('Authentication failed');
      if (data.errors?.length) throw new Error(data.errors[0].message);
      return data.data;
    };
    // Resolve teamId from teamKey
    let teamId;
    try {
      const teamsData = await linearGql('{ teams { nodes { id name key } } }');
      const team = teamsData.teams.nodes.find(t => t.key.toLowerCase() === teamKey.toLowerCase());
      if (!team) {
        sendSSE(res, 'done', { created: 0, failed: 0, error: `Team "${teamKey}" not found` });
        res.end();
        return;
      }
      teamId = team.id;
    } catch (e) {
      sendSSE(res, 'done', { created: 0, failed: 0, error: (e.message || 'Unknown error').slice(0, 200) });
      res.end();
      return;
    }
    const CREATE_ISSUE = `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`;
    let created = 0, failed = 0;
    for (const item of items) {
      sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'creating' });
      let parentId;
      try {
        const input = { teamId, title: item.name };
        if (item.description) input.description = item.description;
        const result = await linearGql(CREATE_ISSUE, { input });
        if (!result.issueCreate.success) throw new Error('Issue creation failed');
        parentId = result.issueCreate.issue.id;
        sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'created', key: result.issueCreate.issue.identifier, url: result.issueCreate.issue.url });
        created++;
      } catch (e) {
        sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'error', error: (e.message || 'Unknown error').slice(0, 200) });
        failed++;
        // Skip sub-issues for this parent
        failed += (item.subissues?.length || 0);
        continue;
      }
      for (const sub of (item.subissues || [])) {
        sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'creating' });
        try {
          const input = { teamId, title: sub.name, parentId };
          if (sub.description) input.description = sub.description;
          if (typeof sub.estimate === 'number' && sub.estimate >= 0) input.estimate = sub.estimate;
          const result = await linearGql(CREATE_ISSUE, { input });
          if (!result.issueCreate.success) throw new Error('Sub-issue creation failed');
          sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'created', key: result.issueCreate.issue.identifier, url: result.issueCreate.issue.url });
          created++;
        } catch (e) {
          sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'error', error: (e.message || 'Unknown error').slice(0, 200) });
          failed++;
        }
      }
    }
    sendSSE(res, 'done', { created, failed });
    res.end();
    return;
  }

  // ==========================================================================
  // Proxy Import Endpoints (SSE streams)
  // ==========================================================================

  // POST /api/import/jira - fetch epics + stories from Jira project
  if (path === '/api/import/jira' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { instanceUrl, email, token, projectKey } = body;
    if (!instanceUrl || !email || !token || !projectKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: instanceUrl, email, token, projectKey' }));
      return;
    }
    if (!/^[A-Z0-9_]{1,50}$/i.test(projectKey)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid projectKey. Must be 1-50 alphanumeric/underscore characters.' }));
      return;
    }
    const origin = validateExternalUrl(instanceUrl);
    if (!origin) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid instance URL. Must be HTTPS and a public host.' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
    const searchUrl = `${origin}/rest/api/3/search/jql`;
    const safeKey = projectKey.replace(/[^A-Za-z0-9_]/g, '');
    const MAX_RESULTS = 100;
    const MAX_ISSUES = 10_000;

    // Paginated JQL fetch helper (token-based pagination)
    const fetchAllIssues = async (jql, fields, phase) => {
      const issues = [];
      let nextPageToken = null;
      do {
        const params = new URLSearchParams({
          jql, fields, maxResults: String(MAX_RESULTS)
        });
        if (nextPageToken) params.set('nextPageToken', nextPageToken);
        let data;
        try {
          const r = await fetchWithTimeout(`${searchUrl}?${params}`, { method: 'GET', headers }, 30_000);
          data = await safeJson(r);
        } catch (e) {
          sendSSE(res, 'error', { phase, error: e.message });
          return null;
        }
        if (data.errorMessages?.length) {
          sendSSE(res, 'error', { phase, error: data.errorMessages.join(', ') });
          return null;
        }
        issues.push(...(data.issues || []));
        nextPageToken = data.nextPageToken || null;
        sendSSE(res, 'progress', { phase, fetched: issues.length });
      } while (nextPageToken && issues.length < MAX_ISSUES);
      return issues;
    };

    // Phase 1: Fetch epics
    sendSSE(res, 'progress', { phase: 'epics', fetched: 0 });
    const epics = await fetchAllIssues(
      `project = "${safeKey}" AND issuetype = Epic ORDER BY rank ASC`,
      'summary,description,status,labels,priority',
      'epics'
    );
    if (!epics) { res.end(); return; }

    // Phase 2: Fetch stories
    sendSSE(res, 'progress', { phase: 'stories', fetched: 0 });
    const stories = await fetchAllIssues(
      `project = "${safeKey}" AND issuetype = Story ORDER BY rank ASC`,
      'summary,description,status,parent,labels,priority,story_points,customfield_10016',
      'stories'
    );
    if (!stories) { res.end(); return; }

    // Phase 3: Group stories under epics
    const epicMap = new Map();
    const epicList = [];
    for (const epic of epics) {
      const epicObj = {
        key: epic.key,
        summary: epic.fields.summary || '',
        description: adfToPlainText(epic.fields.description).trim(),
        status: jiraStatusToStorymaps(epic.fields.status?.statusCategory?.key),
        labels: epic.fields.labels || [],
        stories: []
      };
      epicMap.set(epic.key, epicObj);
      epicList.push(epicObj);
    }

    const orphanStories = [];
    for (const story of stories) {
      const parentKey = story.fields.parent?.key;
      const storyObj = {
        key: story.key,
        summary: story.fields.summary || '',
        description: adfToPlainText(story.fields.description).trim(),
        status: jiraStatusToStorymaps(story.fields.status?.statusCategory?.key),
        labels: story.fields.labels || [],
        points: story.fields.story_points ?? story.fields.customfield_10016 ?? null
      };
      if (parentKey && epicMap.has(parentKey)) {
        epicMap.get(parentKey).stories.push(storyObj);
      } else {
        orphanStories.push(storyObj);
      }
    }

    // Add orphan stories as "Other" pseudo-epic
    if (orphanStories.length > 0) {
      epicList.push({
        key: null,
        summary: 'Other',
        description: '',
        status: 'planned',
        labels: [],
        stories: orphanStories
      });
    }

    sendSSE(res, 'done', { projectKey: safeKey, epics: epicList, epicCount: epicList.length, storyCount: stories.length });
    res.end();
    return;
  }

  // POST /api/import/asana - fetch tasks + subtasks from Asana project
  // Mapping: Task -> Step (backbone column), Subtask -> Story card
  if (path === '/api/import/asana' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { token, projectGid } = body;
    if (!token || !projectGid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: token, projectGid' }));
      return;
    }
    if (token.length > 256) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token too long.' }));
      return;
    }
    if (!/^\d+$/.test(projectGid)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid projectGid. Must be numeric.' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const asanaHeaders = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    const BASE = 'https://app.asana.com/api/1.0';

    // Phase 1: Fetch project name
    sendSSE(res, 'progress', { phase: 'project', fetched: 0 });
    let projectName;
    try {
      const r = await fetchWithTimeout(`${BASE}/projects/${projectGid}?opt_fields=name`, { method: 'GET', headers: asanaHeaders }, 15_000);
      const data = await safeJson(r);
      if (data.errors?.length) {
        sendSSE(res, 'error', { phase: 'project', error: data.errors[0].message });
        res.end();
        return;
      }
      projectName = data.data?.name || 'Asana Project';
    } catch (e) {
      sendSSE(res, 'error', { phase: 'project', error: e.message });
      res.end();
      return;
    }

    // Phase 2: Fetch all top-level tasks (paginated)
    sendSSE(res, 'progress', { phase: 'tasks', fetched: 0 });
    const allTasks = [];
    let offset = null;
    const MAX_TASKS = 10_000;
    const MAX_SUBTASKS = 50_000;
    try {
      do {
        if (res.destroyed) break;
        const params = new URLSearchParams({
          project: projectGid,
          limit: '100',
          opt_fields: 'name,notes,completed,num_subtasks,gid,memberships.section.gid,memberships.section.name'
        });
        if (offset) params.set('offset', offset);
        const r = await fetchWithTimeout(`${BASE}/tasks?${params}`, { method: 'GET', headers: asanaHeaders }, 30_000);
        const data = await safeJson(r);
        if (data.errors?.length) {
          sendSSE(res, 'error', { phase: 'tasks', error: data.errors[0].message });
          res.end();
          return;
        }
        allTasks.push(...(data.data || []));
        offset = data.next_page?.offset || null;
        sendSSE(res, 'progress', { phase: 'tasks', fetched: allTasks.length });
      } while (offset && allTasks.length < MAX_TASKS);
    } catch (e) {
      sendSSE(res, 'error', { phase: 'tasks', error: e.message });
      res.end();
      return;
    }

    // Phase 2.5: Fetch project sections (non-fatal)
    sendSSE(res, 'progress', { phase: 'sections', fetched: 0 });
    const sections = [];
    try {
      const r = await fetchWithTimeout(
        `${BASE}/projects/${projectGid}/sections?opt_fields=name&limit=100`,
        { method: 'GET', headers: asanaHeaders }, 15_000
      );
      const data = await safeJson(r);
      if (!data.errors?.length) {
        for (const s of (data.data || [])) {
          sections.push({ gid: s.gid, name: s.name });
        }
      }
    } catch { /* non-fatal - sections toggle just won't appear */ }

    // Phase 3: For each task with subtasks, fetch its subtasks
    sendSSE(res, 'progress', { phase: 'subtasks', fetched: 0 });
    const epicList = [];
    let subtaskTotal = 0;
    for (const task of allTasks) {
      if (res.destroyed) break;
      const membership = (task.memberships || []).find(m => m.section?.gid);
      const epic = {
        key: task.gid || '',
        summary: task.name || '',
        description: (task.notes || '').trim() || undefined,
        status: task.completed ? 'done' : 'planned',
        sectionGid: membership?.section?.gid || '',
        sectionName: membership?.section?.name || '',
        stories: []
      };

      if (task.num_subtasks > 0 && /^\d+$/.test(task.gid) && subtaskTotal < MAX_SUBTASKS) {
        try {
          let subOffset = null;
          do {
            const params = new URLSearchParams({
              limit: '100',
              opt_fields: 'name,notes,completed,gid'
            });
            if (subOffset) params.set('offset', subOffset);
            const r = await fetchWithTimeout(`${BASE}/tasks/${task.gid}/subtasks?${params}`, { method: 'GET', headers: asanaHeaders }, 30_000);
            const data = await safeJson(r);
            if (data.errors?.length) break;
            for (const sub of (data.data || [])) {
              epic.stories.push({
                key: sub.gid || '',
                summary: sub.name || '',
                description: (sub.notes || '').trim() || undefined,
                status: sub.completed ? 'done' : 'planned'
              });
            }
            subOffset = data.next_page?.offset || null;
          } while (subOffset && subtaskTotal + epic.stories.length < MAX_SUBTASKS);
          subtaskTotal += epic.stories.length;
          sendSSE(res, 'progress', { phase: 'subtasks', fetched: subtaskTotal });
        } catch { /* skip subtask fetch errors, keep task with empty stories */ }
      }

      epicList.push(epic);
    }

    sendSSE(res, 'done', {
      projectName,
      epics: epicList,
      sections,
      taskCount: allTasks.length,
      subtaskCount: subtaskTotal
    });
    res.end();
    return;
  }

  // POST /api/import/linear - fetch issues from Linear team
  if (path === '/api/import/linear' && req.method === 'POST') {
    if (isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { apiKey, teamKey } = body;
    if (!apiKey || typeof apiKey !== 'string' || !teamKey || typeof teamKey !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: apiKey, teamKey' }));
      return;
    }
    if (apiKey.length > 256) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API key too long.' }));
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(teamKey)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid team key. Must be 1-50 alphanumeric characters.' }));
      return;
    }

    const linearGql = async (query, variables) => {
      const r = await fetchWithTimeout('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      }, 30_000);
      const data = await safeJson(r);
      if (r.status === 401 || r.status === 403) throw new Error('Authentication failed');
      if (data.errors?.length) throw new Error(data.errors[0].message);
      return data.data;
    };

    const linearStatusToStorymaps = (type) => {
      if (type === 'completed' || type === 'cancelled') return 'done';
      if (type === 'started') return 'in-progress';
      return 'planned';
    };

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    // Phase 1: Find team by key
    sendSSE(res, 'progress', { phase: 'team' });
    let teamId, teamName;
    try {
      const data = await linearGql('{ teams { nodes { id name key } } }');
      const team = (data.teams?.nodes || []).find(t => t.key.toLowerCase() === teamKey.toLowerCase());
      if (!team) {
        sendSSE(res, 'error', { error: `No team found with key "${teamKey}". Available: ${(data.teams?.nodes || []).map(t => t.key).join(', ') || 'none'}` });
        res.end();
        return;
      }
      teamId = team.id;
      teamName = team.name;
    } catch (e) {
      sendSSE(res, 'error', { error: e.message });
      res.end();
      return;
    }

    // Phase 2: Fetch issues (paginated)
    const ISSUES_QUERY = `query($teamId: ID!, $after: String) {
      issues(filter: { team: { id: { eq: $teamId } } }, first: 100, after: $after) {
        nodes {
          id identifier title description url
          state { name type }
          labels { nodes { name } }
          estimate
          parent { id identifier }
          children { nodes { id } }
          project { id name url }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;

    const allIssues = [];
    let afterCursor = null;
    const MAX_ISSUES = 10_000;
    try {
      do {
        if (res.destroyed) break;
        const data = await linearGql(ISSUES_QUERY, { teamId, after: afterCursor });
        const page = data.issues;
        allIssues.push(...(page.nodes || []));
        afterCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
        sendSSE(res, 'progress', { phase: 'issues', fetched: allIssues.length });
      } while (afterCursor && allIssues.length < MAX_ISSUES);
    } catch (e) {
      sendSSE(res, 'error', { phase: 'issues', error: e.message });
      res.end();
      return;
    }

    // Phase 3: Normalize + send
    const issues = allIssues.map(issue => ({
      id: issue.id,
      identifier: issue.identifier,
      summary: issue.title,
      description: issue.description || undefined,
      url: issue.url,
      status: linearStatusToStorymaps(issue.state?.type),
      labels: (issue.labels?.nodes || []).map(l => l.name),
      points: issue.estimate != null ? issue.estimate : undefined,
      parentId: issue.parent?.id || undefined,
      parentIdentifier: issue.parent?.identifier || undefined,
      hasChildren: (issue.children?.nodes || []).length > 0,
      projectId: issue.project?.id || undefined,
      projectName: issue.project?.name || undefined,
      projectUrl: issue.project?.url || undefined
    }));

    // Deduplicate projects from issue data
    const projectMap = new Map();
    for (const issue of issues) {
      if (issue.projectId && !projectMap.has(issue.projectId)) {
        projectMap.set(issue.projectId, {
          id: issue.projectId,
          name: issue.projectName,
          url: issue.projectUrl
        });
      }
    }
    const projects = [...projectMap.values()];

    sendSSE(res, 'done', {
      teamName,
      teamKey,
      issues,
      projects,
      issueCount: issues.length
    });
    res.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
};

const countCards = (snapshot) => {
  const flat = (arr) => Array.isArray(arr) ? arr.reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) : 0;
  const steps = Array.isArray(snapshot.steps) ? snapshot.steps.filter(s => s.name && !s.partialMapId).length : 0;
  const stories = Array.isArray(snapshot.slices) ? snapshot.slices.reduce((n, s) => n + flat(s.stories), 0) : 0;
  return steps + flat(snapshot.users) + flat(snapshot.activities) + stories;
};

// =============================================================================
// Serialization (Yjs doc → JSON v1 / YAML)
// =============================================================================

const serializeDoc = (doc) => {
  const ymap = doc.getMap('storymap');
  const columns = ymap.get('columns')?.toJSON() || [];
  const usersMap = ymap.get('users')?.toJSON() || {};
  const activitiesMap = ymap.get('activities')?.toJSON() || {};
  const slicesArr = ymap.get('slices')?.toJSON() || [];
  const legendArr = ymap.get('legend')?.toJSON() || [];
  const notes = doc.getText('notes')?.toString() || '';

  const sCard = (c) => {
    const o = { name: c.name || '' };
    if (c.body) o.body = c.body;
    if (c.color) o.color = c.color;
    if (c.url) o.url = c.url;
    if (c.hidden) o.hidden = true;
    if (c.status) o.status = c.status;
    if (c.points != null) o.points = c.points;
    const tags = c.tags ? (typeof c.tags === 'string' ? JSON.parse(c.tags) : c.tags) : [];
    if (tags.length) o.tags = tags;
    return o;
  };

  const toPositional = (map) => columns.map(col => (map[col.id] || []).map(sCard));

  const result = {
    app: 'storymap', v: 1,
    exported: new Date().toISOString(),
    name: ymap.get('name') || '',
    users: toPositional(usersMap),
    activities: toPositional(activitiesMap),
    steps: columns.map(col => {
      if (col.partialMapId) {
        const o = { partialMapId: col.partialMapId };
        if (col.partialMapOrigin) o.partialMapOrigin = true;
        return o;
      }
      return sCard(col);
    }),
    slices: slicesArr.map(s => {
      const stories = s.stories || {};
      const obj = { name: s.name || '', stories: columns.map(col => (stories[col.id] || []).map(sCard)) };
      if (s.collapsed) obj.collapsed = true;
      return obj;
    }),
  };

  if (legendArr.length) result.legend = legendArr.map(e => ({ color: e.color, label: e.label }));
  if (notes) result.notes = notes;

  // Partial maps: stored in state format (keyed by IDs), convert to serialized format (positional arrays)
  const pmRaw = ymap.get('partialMaps');
  if (pmRaw) {
    const pms = typeof pmRaw === 'string' ? JSON.parse(pmRaw) : pmRaw;
    if (pms?.length) {
      result.partialMaps = pms.map(pm => {
        const pmCols = pm.columns || [];
        return {
          id: pm.id,
          name: pm.name,
          users: pmCols.map(c => (pm.users?.[c.id] || []).map(sCard)),
          activities: pmCols.map(c => (pm.activities?.[c.id] || []).map(sCard)),
          steps: pmCols.map(sCard),
          stories: slicesArr.map(slice =>
            pmCols.map(c => (pm.stories?.[slice.id]?.[c.id] || []).map(sCard))
          )
        };
      });
    }
  }

  return result;
};

// Compute ETag from content fields only (excludes volatile metadata like exported, locked)
const contentEtag = (data) => {
  const { app, v, exported, id, site, locked, backups, ...content } = data;
  return `"${createHash('md5').update(JSON.stringify(content, null, 2)).digest('hex')}"`;
};

const loadAndSerialize = async (mapId, host) => {
  // Try in-memory first (active WebSocket connections)
  let doc = docs.get(mapId);
  let data;
  if (doc) {
    data = serializeDoc(doc);
  } else {
    // Load from LevelDB persistence
    const persistence = getPersistence();
    if (!persistence) return null;
    doc = new Y.Doc();
    await persistence.bindState(mapId, doc);
    const ymap = doc.getMap('storymap');
    if (!ymap.get('columns')) { doc.destroy(); return null; }
    data = serializeDoc(doc);
    doc.destroy();
  }
  if (data) {
    // Insert name, id, locked for readable key ordering
    const { app, v, exported, name, ...rest } = data;
    const locks = await readJson(LOCK_FILE, {});
    const site = (host || '').replace(/:\d+$/, '');
    data = { app, v, exported, name, id: mapId, site, locked: !!locks[mapId]?.isLocked, ...rest };
    // Include backups for format URLs and exports
    const backups = await readJson(getBackupFile(mapId), []);
    if (backups.length) data.backups = backups;
  }
  return data;
};

/** Append a log entry to a Yjs doc's log Y.Array. */
const appendLogEntry = (doc, text, ids = []) => {
  const yarray = doc.getArray('log');
  const entry = { ts: Date.now(), src: 'cli', text, sid: '', ids };
  doc.transact(() => {
    yarray.push([entry]);
    while (yarray.length > 20) yarray.delete(0);
  }, 'local');
};

/**
 * Diff a CLI push: snapshot before write, call again after write to collect changed IDs.
 * Returns { text, ids } or null if nothing changed.
 */
const diffPush = (oldSnapshot, body, newDoc) => {
  const old = oldSnapshot;
  const flat = (arr) => Array.isArray(arr) ? arr.flat().length : 0;
  const oldSteps = old.steps?.filter(s => !s.partialMapId).length || 0;
  const newSteps = (body.steps || []).filter(s => !s.partialMapId).length;
  const oldSlices = old.slices?.length || 0;
  const newSlices = (body.slices || []).length;
  const oldCards = flat(old.users) + flat(old.activities)
    + (old.slices || []).reduce((n, s) => n + flat(s.stories), 0);
  const newCards = flat(body.users) + flat(body.activities)
    + (body.slices || []).reduce((n, s) => n + flat(s.stories), 0);

  const parts = [];
  const ids = [];
  const diff = (label, o, n) => {
    if (n > o) { const d = n - o; parts.push(`added ${d} ${d === 1 ? label.replace(/s$/, '') : label}`); }
    else if (n < o) { const d = o - n; parts.push(`removed ${d} ${d === 1 ? label.replace(/s$/, '') : label}`); }
  };
  if (old.name !== (body.name || '')) parts.push('renamed map');
  diff('steps', oldSteps, newSteps);
  diff('slices', oldSlices, newSlices);
  diff('cards', oldCards, newCards);

  // Detect per-item content edits and collect new Yjs IDs of changed items
  if (!parts.length) {
    const j = (v) => JSON.stringify(v ?? []);
    if (j(old.steps) !== j(body.steps)) parts.push('edited steps');
    if (j(old.users) !== j(body.users)) parts.push('edited user cards');
    if (j(old.activities) !== j(body.activities)) parts.push('edited activity cards');
    if (j(old.slices) !== j(body.slices)) parts.push('edited slices');
    if (j(old.legend) !== j(body.legend)) parts.push('edited legend');
    if ((old.notes || '') !== (body.notes || '')) parts.push('edited notes');
  }
  if (!parts.length) return null;

  // Collect IDs of changed cards/steps from the new doc
  const ymap = newDoc.getMap('storymap');
  const columns = ymap.get('columns')?.toJSON() || [];

  // Diff steps
  (body.steps || []).forEach((step, i) => {
    if (i < (old.steps || []).length && JSON.stringify(old.steps[i]) !== JSON.stringify(step)) {
      if (columns[i]?.id) ids.push(columns[i].id);
    }
  });

  // Diff card rows (users, activities) by position
  const diffCards = (oldRow, newRow, yMapKey) => {
    const yRow = ymap.get(yMapKey)?.toJSON() || {};
    (newRow || []).forEach((cards, colIdx) => {
      const oldCards = oldRow?.[colIdx] || [];
      const colId = columns[colIdx]?.id;
      if (!colId) return;
      const yCards = yRow[colId] || [];
      (cards || []).forEach((card, cardIdx) => {
        if (JSON.stringify(oldCards[cardIdx]) !== JSON.stringify(card)) {
          if (yCards[cardIdx]?.id) ids.push(yCards[cardIdx].id);
        }
      });
    });
  };
  diffCards(old.users, body.users, 'users');
  diffCards(old.activities, body.activities, 'activities');

  // Diff slice story cards
  (body.slices || []).forEach((slice, si) => {
    const oldSlice = old.slices?.[si];
    const ySlices = ymap.get('slices')?.toJSON() || [];
    const ySlice = ySlices[si];
    (slice.stories || []).forEach((cards, colIdx) => {
      const oldCards = oldSlice?.stories?.[colIdx] || [];
      const colId = columns[colIdx]?.id;
      if (!colId) return;
      const yCards = ySlice?.stories?.[colId] || [];
      (cards || []).forEach((card, cardIdx) => {
        if (JSON.stringify(oldCards[cardIdx]) !== JSON.stringify(card)) {
          if (yCards[cardIdx]?.id) ids.push(yCards[cardIdx].id);
        }
      });
    });
  });

  return { text: parts.join(', ').replace(/^./, c => c.toUpperCase()), ids };
};

// =============================================================================
// Write JSON → Yjs doc (server-side equivalent of client syncToYjs)
// =============================================================================

const writeDocFromJson = (doc, data, Y) => {
  doc.transact(() => {
    const ymap = doc.getMap('storymap');
    ymap.set('name', data.name || '');

    // Columns
    const columns = (data.steps || []).map(step => {
      const id = generateCardId();
      if (step.partialMapId) {
        const col = { id, partialMapId: step.partialMapId };
        if (step.partialMapOrigin) col.partialMapOrigin = true;
        return col;
      }
      return {
        id, name: step.name || '', color: step.color || '', hidden: step.hidden || false,
        body: step.body || '', url: step.url || null, status: step.status || null,
        points: step.points != null ? step.points : null, tags: step.tags || [],
      };
    });

    const yColumns = new Y.Array();
    columns.forEach(col => {
      const yCol = new Y.Map();
      yCol.set('id', col.id);
      if (col.partialMapId) {
        yCol.set('partialMapId', col.partialMapId);
        if (col.partialMapOrigin) yCol.set('partialMapOrigin', true);
      } else {
        yCol.set('name', col.name);
        if (col.color) yCol.set('color', col.color);
        if (col.hidden) yCol.set('hidden', true);
        if (col.body) yCol.set('body', col.body);
        if (col.url) yCol.set('url', col.url);
        if (col.status) yCol.set('status', col.status);
        if (col.points != null) yCol.set('points', col.points);
        if (col.tags?.length) yCol.set('tags', JSON.stringify(col.tags));
      }
      yColumns.push([yCol]);
    });
    ymap.set('columns', yColumns);

    // Helper: create a Y.Map card from a plain object
    const makeYCard = (card) => {
      const ym = new Y.Map();
      ym.set('id', generateCardId());
      ym.set('name', card.name || '');
      if (card.body) ym.set('body', card.body);
      if (card.color) ym.set('color', card.color);
      if (card.url) ym.set('url', card.url);
      if (card.hidden) ym.set('hidden', true);
      if (card.status) ym.set('status', card.status);
      if (card.points != null) ym.set('points', card.points);
      if (card.tags?.length) ym.set('tags', JSON.stringify(card.tags));
      return ym;
    };

    // Users (positional array → keyed by column ID)
    const yUsers = new Y.Map();
    (data.users || []).forEach((cards, i) => {
      if (i >= columns.length) return;
      const yArr = new Y.Array();
      (cards || []).forEach(card => yArr.push([makeYCard(card)]));
      yUsers.set(columns[i].id, yArr);
    });
    ymap.set('users', yUsers);

    // Activities
    const yActivities = new Y.Map();
    (data.activities || []).forEach((cards, i) => {
      if (i >= columns.length) return;
      const yArr = new Y.Array();
      (cards || []).forEach(card => yArr.push([makeYCard(card)]));
      yActivities.set(columns[i].id, yArr);
    });
    ymap.set('activities', yActivities);

    // Slices
    const ySlices = new Y.Array();
    (data.slices || []).forEach(slice => {
      const ySlice = new Y.Map();
      ySlice.set('id', generateCardId());
      ySlice.set('name', slice.name || '');
      if (slice.collapsed) ySlice.set('collapsed', true);
      if (slice.closedReason) ySlice.set('closedReason', slice.closedReason);

      const yStories = new Y.Map();
      (slice.stories || []).forEach((cards, i) => {
        if (i >= columns.length) return;
        const yArr = new Y.Array();
        (cards || []).forEach(card => yArr.push([makeYCard(card)]));
        yStories.set(columns[i].id, yArr);
      });
      ySlice.set('stories', yStories);
      ySlices.push([ySlice]);
    });
    ymap.set('slices', ySlices);

    // Legend
    const yLegend = new Y.Array();
    (data.legend || []).forEach(entry => {
      const ym = new Y.Map();
      ym.set('id', generateCardId());
      ym.set('color', entry.color);
      ym.set('label', entry.label || '');
      yLegend.push([ym]);
    });
    ymap.set('legend', yLegend);

    // Notes
    if (data.notes) {
      const ytext = doc.getText('notes');
      if (ytext.length > 0) ytext.delete(0, ytext.length);
      ytext.insert(0, data.notes);
    }

    // Partial maps (stored as JSON string, same as client)
    if (data.partialMaps?.length) {
      ymap.set('partialMaps', JSON.stringify(data.partialMaps));
    }

    // Activity log — skip on import to prevent injecting fake history
  });
};

// =============================================================================
// HTTP Server
// =============================================================================

const server = createServer(async (req, res) => {
  try {
  const reqPath = req.url.split('?')[0];

  // API routes
  if (reqPath.startsWith('/api/')) {
    return handleApi(req, res);
  }

  // Redirect /favicon.ico → /favicon.svg (browsers request .ico for non-HTML pages)
  if (reqPath === '/favicon.ico') {
    res.writeHead(302, { 'Location': '/favicon.svg' });
    res.end();
    return;
  }

  // Static files — try cache first, then disk
  let relPath = reqPath === '/' ? '/index.html' : reqPath;
  const ext = extname(relPath);

  // Resolve cache key: SPA fallback uses '/index.html'
  let cacheKey = relPath;
  let cached = fileCache.get(cacheKey);

  if (!cached) {
    // Try to read from disk (resolve + startsWith guard against path traversal)
    let content;
    for (const dir of STATIC_DIRS) {
      // Strip leading / and matching dir prefix (e.g. /src/app.js → app.js for SRC_DIR)
      let filePart = relPath.slice(1);
      const dirName = basename(dir);
      if (filePart.startsWith(dirName + '/')) filePart = filePart.slice(dirName.length + 1);
      const resolved = resolve(dir, filePart);
      if (!resolved.startsWith(dir + '/') && resolved !== dir) continue;
      try {
        content = await readFile(resolved);
        break;
      } catch {
        // Try next directory
      }
    }

    // Format extension: /:mapId.json, /:mapId.yaml, or /:mapId.csv
    if (!content && !reqPath.includes('/', 1) && (ext === '.json' || ext === '.yaml' || ext === '.csv')) {
      const mapId = reqPath.slice(1, -ext.length);
      if (mapId) {
        const data = await loadAndSerialize(mapId, req.headers.host);
        if (data) {
          const body = ext === '.csv'
            ? exportToCsv(data)
            : ext === '.yaml'
              ? dumpYaml(jsonToYamlObj(data))
              : JSON.stringify(data, null, 2);
          const ct = ext === '.csv' ? 'text/csv' : ext === '.yaml' ? 'text/yaml' : 'application/json';
          const headers = { 'Content-Type': ct + '; charset=utf-8', 'Cache-Control': 'no-store' };
          if (ext === '.csv') headers['Content-Disposition'] = `attachment; filename="${sanitizeFilename(data.name) + '.csv'}"`;
          res.writeHead(200, headers);
          res.end(body);
          return;
        }
      }
    }

    // SPA fallback: serve index.html for map URLs (no extension, not in subdirectories)
    let isHtmlFallback = false;
    if (!content && !reqPath.includes('/', 1) && ext === '') {
      cacheKey = '/index.html';
      cached = fileCache.get(cacheKey);
      if (!cached) {
        try {
          content = await readFile(join(PUBLIC_DIR, 'index.html'));
          isHtmlFallback = true;
        } catch {
          // Fall through to 404
        }
      }
    }

    // Build cache entry from disk content
    if (content && !cached) {
      const fileExt = isHtmlFallback ? '.html' : ext;
      const etag = `"${createHash('md5').update(content).digest('hex')}"`;
      cached = {
        etag,
        raw: content,
        gzipped: COMPRESSIBLE.has(fileExt) ? gzipSync(content) : null,
        contentType: isHtmlFallback ? 'text/html' : (MIME_TYPES[ext] || 'application/octet-stream'),
        cacheControl: cacheHeader(fileExt),
      };
      fileCache.set(cacheKey, cached);
    }
  }

  if (cached) {
    if (req.headers['if-none-match'] === cached.etag) {
      res.writeHead(304, { 'Cache-Control': cached.cacheControl });
      res.end();
      return;
    }

    const headers = {
      'Content-Type': cached.contentType,
      'Cache-Control': cached.cacheControl,
      'ETag': cached.etag,
    };

    const acceptGzip = (req.headers['accept-encoding'] || '').includes('gzip');
    if (acceptGzip && cached.gzipped) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      res.end(cached.gzipped);
    } else {
      res.writeHead(200, headers);
      res.end(cached.raw);
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
  } catch (err) {
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

// =============================================================================
// SQLite Map Index
// =============================================================================

const DB_FILE = join(DATA_DIR, 'maps.db');
const sqlite = new Database(DB_FILE);
sqlite.pragma('journal_mode = WAL');
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at TEXT,
    updated_at TEXT
  )
`);

const stmtInsert = sqlite.prepare(
  'INSERT OR IGNORE INTO maps (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
);
const stmtUpdate = sqlite.prepare(
  'UPDATE maps SET name = ?, updated_at = ? WHERE id = ?'
);
const stmtExists = sqlite.prepare('SELECT 1 FROM maps WHERE id = ?');

const generateUniqueMapId = () => {
  for (let i = 0; i < 10; i++) {
    const bytes = randomBytes(6);
    const num = Array.from(bytes).reduce((acc, b) => acc * 256n + BigInt(b), 0n);
    const id = num.toString(36).slice(-8).padStart(8, '0');
    if (!stmtExists.get(id)) return id;
  }
  throw new Error('Failed to generate unique ID');
};

const generateCardId = () => {
  const bytes = randomBytes(6);
  const num = Array.from(bytes).reduce((acc, b) => acc * 256n + BigInt(b), 0n);
  return num.toString(36).slice(-8).padStart(8, '0');
};

// Debounce map for update writes (mapId → timeout)
const updateTimers = new Map();

const flushMapUpdate = (mapId) => {
  if (!updateTimers.has(mapId)) return;
  clearTimeout(updateTimers.get(mapId));
  updateTimers.delete(mapId);
  try {
    const doc = docs.get(mapId);
    if (doc) {
      const ymap = doc.getMap('storymap');
      const name = ymap.get('name') || 'untitled';
      stmtUpdate.run(name, new Date().toISOString(), mapId);
    }
  } catch (err) {
    console.error(`SQLite flush error for ${mapId}:`, err.message);
  }
};

const trackMapUpdate = (mapId) => {
  if (updateTimers.has(mapId)) clearTimeout(updateTimers.get(mapId));
  updateTimers.set(mapId, setTimeout(() => flushMapUpdate(mapId), 2_000));
};

// Track which docs we've already hooked
const trackedDocs = new Set();

// =============================================================================
// WebSocket Server
// =============================================================================

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  if (!isOriginAllowed(req.headers.origin)) {
    ws.close(4403, 'Forbidden');
    return;
  }
  setupWSConnection(ws, req);

  // Hook into the doc for SQLite tracking
  const docName = (req.url || '').slice(1).split('?')[0];
  const doc = docs.get(docName);
  if (doc && !trackedDocs.has(docName)) {
    trackedDocs.add(docName);

    // Record map creation (INSERT OR IGNORE — won't overwrite migrated data)
    const now = new Date().toISOString();
    stmtInsert.run(docName, 'untitled', now, now);

    // Track updates with debounce
    doc.on('update', () => trackMapUpdate(docName));

    // Flush pending writes when all clients disconnect and doc closes
    doc.on('destroy', () => {
      flushMapUpdate(docName);
      trackedDocs.delete(docName);
    });
  }
});

// =============================================================================
// Start
// =============================================================================

await ensureDataDir();

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

// Log active presence every 30 seconds
setInterval(() => {
  const rooms = [];
  for (const [name, doc] of docs) {
    const count = doc.awareness.getStates().size;
    if (count > 0) rooms.push(`${name}(${count})`);
  }
  if (rooms.length > 0) {
    console.log(`[${new Date().toISOString()}] [presence] ${rooms.length} active rooms: ${rooms.join(', ')}`);
  }
}, 30_000);

// Graceful shutdown: stop connections, flush LevelDB + SQLite, then exit
const gracefulShutdown = async () => {
  // Force exit after 5s if cleanup hangs
  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, forcing exit.');
    process.exit(1);
  }, 5_000);
  forceExit.unref();

  try {
    console.log('Shutting down...');

    // Stop accepting new connections
    server.close();
    wss.close();

    // Close all WebSocket clients
    for (const ws of wss.clients) {
      ws.close();
    }

    // Flush all active Yjs docs to LevelDB, then destroy
    const persistence = getPersistence();
    for (const [name, doc] of docs) {
      try {
        if (persistence) await persistence.writeState(name, doc);
        doc.destroy();
      } catch (err) {
        console.error(`Error flushing doc ${name}:`, err.message);
      }
    }

    // Close LevelDB
    if (persistence?.provider?.destroy) {
      await persistence.provider.destroy();
    }

    // Flush pending SQLite writes
    for (const mapId of updateTimers.keys()) {
      flushMapUpdate(mapId);
    }
    sqlite.close();

    console.log('Shutdown complete.');
  } catch (err) {
    console.error('Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
};
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
