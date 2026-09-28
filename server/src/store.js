'use strict';
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt, sha256 } = require('./crypto');

const PROJECT_RE = /^[a-f0-9]{64}$/;

function validRelPath(p) {
  if (typeof p !== 'string' || !p || p.length > 300) return false;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0') || p.includes('\n')) return false;
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..')) return false;
  return parts[parts.length - 1].startsWith('.env');
}

function createStore({ dataDir, key, keep }) {
  const fileDir = (pid, rel) => path.join(dataDir, pid, sha256(rel));

  function versions(dir) {
    try {
      return fs.readdirSync(dir).filter((f) => f.endsWith('.enc')).sort();
    } catch {
      return [];
    }
  }

  function writeAtomic(file, buf) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function put(pid, rel, content) {
    const dir = fileDir(pid, rel);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const vs = versions(dir);
    if (vs.length) {
      const latest = decrypt(key, fs.readFileSync(path.join(dir, vs[vs.length - 1])));
      if (latest.equals(content)) return { changed: false };
    }
    const name = `${String(Date.now()).padStart(15, '0')}-${String(vs.length).padStart(6, '0')}.enc`;
    writeAtomic(path.join(dir, name), encrypt(key, content));
    writeAtomic(path.join(dir, 'meta.json'), Buffer.from(JSON.stringify({ path: rel })));
    for (const old of vs.slice(0, Math.max(0, vs.length + 1 - keep))) {
      fs.unlinkSync(path.join(dir, old));
    }
    return { changed: true };
  }

  function get(pid, rel, version) {
    const dir = fileDir(pid, rel);
    const vs = versions(dir);
    if (!vs.length) return null;
    const name = version ? vs.find((v) => v === `${version}.enc`) : vs[vs.length - 1];
    if (!name) return null;
    return decrypt(key, fs.readFileSync(path.join(dir, name)));
  }

  function listVersions(pid, rel) {
    return versions(fileDir(pid, rel)).map((v) => v.replace(/\.enc$/, ''));
  }

  function list(pid) {
    const base = path.join(dataDir, pid);
    let entries = [];
    try {
      entries = fs.readdirSync(base);
    } catch {
      return [];
    }
    const out = [];
    for (const e of entries) {
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(base, e, 'meta.json'), 'utf8')).path);
      } catch {
        /* skip incomplete dirs */
      }
    }
    return out.filter(validRelPath).sort();
  }

  return { put, get, list, listVersions };
}

module.exports = { createStore, validRelPath, PROJECT_RE };
