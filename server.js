// Storymaps.io — AGPL-3.0 — see LICENCE for details
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import Database from 'better-sqlite3';

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

import { jsonToYamlObj } from './src/yaml.js';
import jsyaml from '#js-yaml';

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

  // Check origin for write requests
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !isOriginAllowed(req.headers.origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  // Parse JSON body for POST/PUT/DELETE (1 MB limit)
  let body = null;
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const MAX_BODY = 1_048_576;
    body = await new Promise((resolve, reject) => {
      let data = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { req.destroy(); reject(new Error('Body too large')); return; }
        data += chunk;
      });
      req.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
      req.on('error', reject);
    }).catch(() => null);
    if (body === null && req.destroyed) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
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
    const Y = await import('yjs');
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
            ? jsyaml.dump(jsonToYamlObj(data), { indent: 2, lineWidth: 120, noRefs: true, quotingType: '"' })
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
  console.log('Shutting down...');

  // Stop accepting new connections
  server.close();
  wss.close();

  // Close all WebSocket clients
  for (const ws of wss.clients) {
    ws.close();
  }

  // Persist and destroy all active Yjs docs (flushes LevelDB)
  const persistence = getPersistence();
  for (const [name, doc] of docs) {
    if (persistence) {
      await persistence.writeState(name, doc);
    }
    doc.destroy();
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
  process.exit(0);
};
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
