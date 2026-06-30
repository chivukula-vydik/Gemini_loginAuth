import { resolveFeature, getFlags, ensureFlags } from '../services/featureFlags.js';
import { User } from '../models/User.js';

export function requireFeature(featureKey) {
  return async (req, res, next) => {
    // if no auth yet, let the route's own requireAuth handle rejection
    if (!req.user?.sub) return next();
    const flags = await ensureFlags();
    if (!req._fullUser) {
      req._fullUser = await User.findById(req.user.sub).select('email roles featureOverrides').lean();
    }
    const user = req._fullUser || req.user;
    // convert Mongoose Map if needed
    if (user.featureOverrides instanceof Map) {
      user.featureOverrides = Object.fromEntries(user.featureOverrides);
    }
    if (!resolveFeature(featureKey, user, flags)) {
      return res.status(403).json({ error: 'feature_disabled' });
    }
    next();
  };
}
