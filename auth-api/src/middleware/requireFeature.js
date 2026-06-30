import { resolveFeature, ensureFlags } from '../services/featureFlags.js';
import { User } from '../models/User.js';

// ponytail: opts.write = true blocks readonly users on mutation routes
export function requireFeature(featureKey, opts) {
  const needsWrite = opts?.write === true;
  return async (req, res, next) => {
    if (!req.user?.sub) return next();
    const flags = await ensureFlags();
    if (!req._fullUser) {
      req._fullUser = await User.findById(req.user.sub).select('email roles featureOverrides').lean();
    }
    const user = req._fullUser || req.user;
    if (user.featureOverrides instanceof Map) {
      user.featureOverrides = Object.fromEntries(user.featureOverrides);
    }
    const access = resolveFeature(featureKey, user, flags);
    if (!access) {
      return res.status(403).json({ error: 'feature_disabled' });
    }
    if (needsWrite && access === 'readonly') {
      return res.status(403).json({ error: 'feature_readonly' });
    }
    req._featureAccess = req._featureAccess || {};
    req._featureAccess[featureKey] = access;
    next();
  };
}
