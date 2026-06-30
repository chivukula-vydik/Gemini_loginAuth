import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { FeatureFlag } from '../models/FeatureFlag.js';
import { User } from '../models/User.js';
import { FEATURE_REGISTRY, FEATURE_KEYS } from '../config/featureRegistry.js';
import { loadFlags, resolveAllFeatures, ensureFlags } from '../services/featureFlags.js';

export function createFeaturesRouter() {
  const router = express.Router();

  // Public: resolved features for current user (used by frontend nav)
  router.get('/my-features', requireAuth, asyncHandler(async (req, res) => {
    const flags = await ensureFlags();
    const user = await User.findById(req.user.sub).select('email roles featureOverrides').lean();
    if (!user) return res.status(404).json({ error: 'not found' });
    // convert Mongoose Map to plain object
    if (user.featureOverrides instanceof Map) {
      user.featureOverrides = Object.fromEntries(user.featureOverrides);
    }
    res.json(resolveAllFeatures(user, flags));
  }));

  // Admin: get registry + all flags (for the matrix UI)
  router.get('/', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const flags = await ensureFlags();
    const registry = FEATURE_KEYS.map(key => ({
      ...FEATURE_REGISTRY[key],
      enabled: flags[key]?.enabled ?? FEATURE_REGISTRY[key].defaultEnabled,
      roleGrants: flags[key]?.roleGrants ?? FEATURE_REGISTRY[key].defaultRoles,
    }));
    res.json(registry);
  }));

  // Admin: toggle global flag
  router.patch('/:key/toggle', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { key } = req.params;
    const reg = FEATURE_REGISTRY[key];
    if (!reg) return res.status(404).json({ error: 'unknown feature' });
    if (reg.system) return res.status(400).json({ error: 'system feature cannot be toggled' });

    const flag = await FeatureFlag.findOneAndUpdate(
      { featureKey: key },
      { enabled: req.body.enabled, updatedBy: req.user.sub, updatedAt: new Date() },
      { new: true },
    );
    await loadFlags();
    res.json(flag);
  }));

  // Admin: update role grants for a feature
  router.patch('/:key/roles', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { key } = req.params;
    const reg = FEATURE_REGISTRY[key];
    if (!reg) return res.status(404).json({ error: 'unknown feature' });
    if (reg.system) return res.status(400).json({ error: 'system feature cannot be modified' });

    const flag = await FeatureFlag.findOneAndUpdate(
      { featureKey: key },
      { roleGrants: req.body.roleGrants, updatedBy: req.user.sub, updatedAt: new Date() },
      { new: true },
    );
    await loadFlags();
    res.json(flag);
  }));

  // Admin: set user override
  router.patch('/user-override/:userId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { featureKey, value } = req.body; // value: 'on' | 'off' | null (null = clear)
    if (!FEATURE_REGISTRY[featureKey]) return res.status(404).json({ error: 'unknown feature' });

    const update = value
      ? { [`featureOverrides.${featureKey}`]: value }
      : { [`featureOverrides.${featureKey}`]: 1 }; // for $unset

    const op = value
      ? { $set: update }
      : { $unset: update };

    await User.updateOne({ _id: userId }, op);
    res.json({ ok: true });
  }));

  // Admin: get user's overrides + resolved state
  router.get('/user-override/:userId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId).select('email roles featureOverrides').lean();
    if (!user) return res.status(404).json({ error: 'not found' });
    if (user.featureOverrides instanceof Map) {
      user.featureOverrides = Object.fromEntries(user.featureOverrides);
    }
    const flags = await ensureFlags();
    res.json({
      overrides: user.featureOverrides || {},
      resolved: resolveAllFeatures(user, flags),
    });
  }));

  return router;
}
