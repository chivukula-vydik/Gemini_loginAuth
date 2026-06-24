import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { RefreshToken } from '../models/RefreshToken.js';

const ACCESS_TTL = process.env.ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.REFRESH_TTL || '7d';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, name: user.displayName, roles: user.roles || [user.role || 'employee'] },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export async function issueRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: String(user._id), jti }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
  });
  const decoded = jwt.decode(token);
  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(decoded.exp * 1000),
  });
  return token;
}

export async function findValidRefreshToken(token) {
  try {
    jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
  const record = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  return record;
}

export async function revokeRefreshToken(token) {
  await RefreshToken.updateOne({ tokenHash: sha256(token) }, { revokedAt: new Date() });
}

export async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}
