import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ALGO = 'aes-256-gcm';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

function getKey() {
  const hex = process.env.FILE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('FILE_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  return Buffer.from(hex, 'hex');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function encryptAndSave(buffer, subDir = '') {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  const fileId = crypto.randomUUID();
  const dir = path.join(UPLOAD_DIR, subDir);
  ensureDir(dir);

  // layout: 12-byte IV | 16-byte auth tag | ciphertext
  const out = Buffer.concat([iv, tag, encrypted]);
  fs.writeFileSync(path.join(dir, fileId), out);
  return fileId;
}

export function decryptAndRead(fileId, subDir = '') {
  const key = getKey();
  const filePath = path.join(UPLOAD_DIR, subDir, fileId);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath);
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function deleteFile(fileId, subDir = '') {
  const filePath = path.join(UPLOAD_DIR, subDir, fileId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
