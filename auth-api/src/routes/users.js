import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { summarize } from '../services/reestimations.js';

export function createUsersRouter() {
  const router = express.Router();

  router.get('/', requireAuth, requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const users = await User.find({ active: { $ne: false } }).select('displayName email role').sort('displayName');
    res.json(users);
  }));

  // Aggregate: how many people have ever asked for a re-estimation. PM/admin only.
  // Declared before '/:id/...' so 'reestimations' is never read as an id.
  router.get('/reestimations/summary', requireAuth, requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const requesters = await User.countDocuments({ reestimationCount: { $gt: 0 } });
    res.json({ requesters });
  }));

  // A user's re-estimation history. A person sees their own; PM/admin see anyone's.
  router.get('/:id/reestimations', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const isSelf = String(req.user.sub) === String(id);
    const isPrivileged = req.user.role === 'pm' || req.user.role === 'admin';
    if (!isSelf && !isPrivileged) return res.status(403).json({ error: 'forbidden' });
    const user = await User.findById(id).select('reestimations');
    if (!user) return res.status(404).json({ error: 'not found' });
    const entries = (user.reestimations || [])
      .slice()
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    res.json({ summary: summarize(entries), entries });
  }));

  return router;
}
