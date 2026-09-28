'use strict';
const crypto = require('crypto');

function loadKey(hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(hex || '')) {
    throw new Error('ENVVAULT_MASTER_KEY must be 64 hex chars (32 bytes). Generate: openssl rand -hex 32');
  }
  return Buffer.from(hex, 'hex');
}

// Layout: iv(12) | tag(16) | ciphertext
function encrypt(key, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function decrypt(key, blob) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { loadKey, encrypt, decrypt, safeEqual, sha256 };
