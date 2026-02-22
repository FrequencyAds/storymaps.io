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

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, timestamps] of rateLimitMap) {
    while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
    if (!timestamps.length) rateLimitMap.delete(ip);
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
};

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
    } else {
      const jsonBody = JSON.stringify(clean, null, 2);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'ETag': etag });
      res.end(jsonBody);
    }
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
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(stats));
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

    // Format extension: /:mapId.json or /:mapId.yaml
    if (!content && !reqPath.includes('/', 1) && (ext === '.json' || ext === '.yaml')) {
      const mapId = reqPath.slice(1, -ext.length);
      if (mapId) {
        const data = await loadAndSerialize(mapId, req.headers.host);
        if (data) {
          const body = ext === '.yaml'
            ? dumpYaml(jsonToYamlObj(data))
            : JSON.stringify(data, null, 2);
          const ct = ext === '.yaml' ? 'text/yaml' : 'application/json';
          res.writeHead(200, { 'Content-Type': ct + '; charset=utf-8', 'Cache-Control': 'no-store' });
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
