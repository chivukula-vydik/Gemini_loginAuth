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
  const existing = await FeatureFlag.find().lean();
  const byKey = new Set(existing.map(f => f.featureKey));
  const toInsert = [];
  for (const key of FEATURE_KEYS) {
    if (!byKey.has(key)) {
      const def = FEATURE_REGISTRY[key];
      toInsert.push({
        featureKey: key,
        enabled: def.defaultEnabled,
        roleGrants: def.defaultRoles,
      });
    }
  }
  if (toInsert.length) await FeatureFlag.insertMany(toInsert);
  return loadFlags();
}

/**
 * Single source of truth for feature access.
 * Used by both backend middleware and serialized to frontend.
 */
export function resolveFeature(featureKey, user, flags) {
  const reg = FEATURE_REGISTRY[featureKey];
  if (!reg) return false;

  // super-admin bypasses all layers
  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const isSuperAdmin = adminEmail && String(user.email || '').toLowerCase().trim() === adminEmail;
  if (isSuperAdmin) return true;

  const flag = flags[featureKey];
  if (!flag?.enabled) return false;

  // user override beats role
  const override = user.featureOverrides?.[featureKey];
  if (override) return override === 'on';

  // fall back to role grant
  const userRoles = user.roles || [];
  return userRoles.some(r => (flag.roleGrants || []).includes(r));
}

/** Resolve all features for a user — returns { [key]: boolean } */
export function resolveAllFeatures(user, flags) {
  const result = {};
  for (const key of FEATURE_KEYS) {
    result[key] = resolveFeature(key, user, flags);
  }
  return result;
}
