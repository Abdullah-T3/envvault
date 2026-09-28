'use strict';
const http = require('http');
const path = require('path');
const { loadKey, safeEqual } = require('./crypto');
const { createStore, validRelPath, PROJECT_RE } = require('./store');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.ENVVAULT_TOKEN;
const MAX_BYTES = 1024 * 1024;

if (!TOKEN || TOKEN.length < 24) {
  console.error('ENVVAULT_TOKEN must be set (>= 24 chars). Generate: openssl rand -hex 24');
  process.exit(1);
}

const store = createStore({
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  key: loadKey(process.env.ENVVAULT_MASTER_KEY),
  keep: Number(process.env.KEEP_VERSIONS || 20),
});

const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        reject(Object.assign(new Error('too large'), { code: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  return f && f.count >= 10 && Date.now() - f.first < 60_000;
}
function noteFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first >= 60_000) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') return send(res, 200, 'ok\n');

    const ip = req.socket.remoteAddress;
    if (tooManyFailures(ip)) return send(res, 429, 'too many failed attempts\n');
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || !safeEqual(auth.slice(7), TOKEN)) {
      noteFailure(ip);
      return send(res, 401, 'unauthorized\n');
    }

    const m = url.pathname.match(/^\/v1\/projects\/([^/]+)\/files(?:\/([^/]+)(\/versions)?)?$/);
    if (!m || !PROJECT_RE.test(m[1])) return send(res, 404, 'not found\n');
    const [, pid, b64, versionsSuffix] = m;

    if (!b64) {
      if (req.method !== 'GET') return send(res, 405, 'method not allowed\n');
      return send(res, 200, store.list(pid).map((p) => `${p}\n`).join(''));
    }

    let rel;
    try {
      rel = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch {
      return send(res, 400, 'bad path\n');
    }
    if (!validRelPath(rel)) return send(res, 400, 'invalid file path\n');

    if (versionsSuffix) {
      if (req.method !== 'GET') return send(res, 405, 'method not allowed\n');
      return send(res, 200, store.listVersions(pid, rel).map((v) => `${v}\n`).join(''));
    }

    if (req.method === 'PUT') {
      const { changed } = store.put(pid, rel, await readBody(req));
      return send(res, changed ? 201 : 200, changed ? 'stored\n' : 'unchanged\n');
    }
    if (req.method === 'GET') {
      const data = store.get(pid, rel, url.searchParams.get('version'));
      return data ? send(res, 200, data, 'application/octet-stream') : send(res, 404, 'not found\n');
    }
    return send(res, 405, 'method not allowed\n');
  } catch (err) {
    if (err.code === 413) return send(res, 413, 'payload too large\n');
    console.error(err);
    return send(res, 500, 'internal error\n');
  }
});

server.listen(PORT, HOST, () => console.log(`envvault listening on ${HOST}:${PORT}`));
