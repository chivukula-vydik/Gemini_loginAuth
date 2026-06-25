import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { summarize } from '../services/reestimations.js';
import { directionCounts, completionStats, onTimeStats } from '../services/reputation.js';

export function createUsersRouter() {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const isPm = (req.user.roles || [req.user.role]).some((r) => ['pm', 'admin'].includes(r));
    const fields = req.query.fields;
    let select = 'displayName email role';
    if (isPm || (fields && typeof fields === 'string' && fields.includes('reportingManagerId'))) {
      select = 'displayName email role roles reportingManagerId departmentId';
    }
    const users = await User.find({ active: { $ne: false } }).select(select).sort('displayName');
    res.json(users.map((u) => ({ ...u.toObject(), roles: u.roles?.length ? u.roles : [u.role || 'employee'] })));
  }));

  // RM's assigned employees. Registered before '/:id' routes to avoid
  // 'my-team' being parsed as an id.
  router.get('/my-team', requireAuth, requireRole('reporting_manager'), asyncHandler(async (req, res) => {
    const team = await User.find({ reportingManagerId: req.user.sub, active: true })
      .select('displayName email role reportingManagerId')
      .sort('displayName');
    res.json(team);
  }));

  // Aggregate: how many people have ever asked for a re-estimation. PM/admin only.
  // Declared before '/:id/...' so 'reestimations' is never read as an id.
  router.get('/reestimations/summary', requireAuth, requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const requesters = await User.countDocuments({ reestimationCount: { $gt: 0 } });
    res.json({ requesters });
  }));

  // Per-person reputation (company fit). Admin only.
  router.get('/reputation', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const users = await User.find({ active: { $ne: false } })
      .select('displayName email role roles reestimations').sort('displayName');
    const tasks = await Task.find({}).select('status dueDate completedAt assignees');

    const byUser = new Map();
    for (const t of tasks) {
      for (const a of t.assignees || []) {
        const uid = String(a.user);
        const arr = byUser.get(uid) || [];
        arr.push({ status: t.status, dueDate: t.dueDate, completedAt: t.completedAt });
        byUser.set(uid, arr);
      }
    }

    const people = users.map((u) => {
      const ut = byUser.get(String(u._id)) || [];
      return {
        _id: String(u._id), displayName: u.displayName, email: u.email, roles: u.roles?.length ? u.roles : [u.role || 'employee'],
        reestimations: summarize(u.reestimations),
        direction: directionCounts(u.reestimations),
        completion: completionStats(ut),
        onTime: onTimeStats(ut),
      };
    });
    res.json({ people });
  }));

  // A user's re-estimation history. A person sees their own; PM/admin see anyone's.
  router.get('/:id/reestimations', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const isSelf = String(req.user.sub) === String(id);
    const isPrivileged = (req.user.roles || [req.user.role]).some((r) => ['pm', 'admin'].includes(r));
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
