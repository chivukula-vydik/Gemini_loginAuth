import { FeatureFlag } from '../models/FeatureFlag.js';
import { FEATURE_REGISTRY, FEATURE_KEYS } from '../config/featureRegistry.js';

// ponytail: module-scoped cache, invalidate on write — no TTL, no Redis
let flagCache = null;

export async function loadFlags() {
  const docs = await FeatureFlag.find().lean();
  const map = {};
  for (const d of docs) map[d.featureKey] = d;
  flagCache = map;
  return map;
}

export function getFlags() {
  return flagCache || {};
}

export function invalidateFlags() {
  flagCache = null;
}

export async function ensureFlags() {
  if (flagCache) return flagCache;
  return loadFlags();
}

/** Seed missing flags from registry on startup. Existing flags are untouched. */
export async function seedFlags() {
  for (const key of FEATURE_KEYS) {
    const def = FEATURE_REGISTRY[key];
    await FeatureFlag.updateOne(
      { featureKey: key },
      { $setOnInsert: { enabled: def.defaultEnabled, roleGrants: def.defaultRoles, readonlyRoles: def.defaultReadonlyRoles || [] } },
      { upsert: true },
    );
  }
  return loadFlags();
}

// ponytail: returns 'full' | 'readonly' | false — single resolver for both middleware and frontend
export function resolveFeature(featureKey, user, flags) {
  const reg = FEATURE_REGISTRY[featureKey];
  if (!reg) return false;

  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const isSuperAdmin = adminEmail && String(user.email || '').toLowerCase().trim() === adminEmail;
  if (isSuperAdmin) return 'full';

  const flag = flags[featureKey];
  if (!flag?.enabled) return false;

  const override = user.featureOverrides?.[featureKey];
  if (override) {
    if (override === 'full' || override === 'on') return 'full';
    if (override === 'readonly') return 'readonly';
    return false;
  }

  const userRoles = user.roles || [];
  const hasFull = userRoles.some(r => (flag.roleGrants || []).includes(r));
  if (hasFull) return 'full';
  const hasReadonly = userRoles.some(r => (flag.readonlyRoles || []).includes(r));
  if (hasReadonly) return 'readonly';
  return false;
}

/** Resolve all features for a user — returns { [key]: 'full' | 'readonly' | false } */
export function resolveAllFeatures(user, flags) {
  const result = {};
  for (const key of FEATURE_KEYS) {
    result[key] = resolveFeature(key, user, flags);
  }
  return result;
}
