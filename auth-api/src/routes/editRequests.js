import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { EditRequest } from '../models/EditRequest.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';

export function createEditRequestsRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('pm', 'admin', 'reporting_manager'));

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status || 'pending';
    const filter = { status, projectId: { $exists: true } };
    const roles = req.user.roles || [req.user.role];
    if (roles.includes('reporting_manager')) {
      const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamMembers.map((u) => u._id) };
    } else if (roles.includes('pm') && !roles.includes('admin')) {
      const projects = await Project.find({
        $or: [{ ownerPm: req.user.sub }, { members: req.user.sub }],
      }).select('_id');
      filter.projectId = { $in: projects.map((p) => p._id) };
    }
    const reqs = await EditRequest.find(filter)
      .populate('userId', 'displayName email')
      .populate('projectId', 'name')
      .sort('-createdAt');
    res.json(reqs);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const reqDoc = await EditRequest.findByIdAndUpdate(
      req.params.id,
      { status: decision, decidedBy: req.user.sub, decidedAt: new Date() },
      { new: true },
    );
    if (!reqDoc) return res.status(404).json({ error: 'not found' });
    res.json(reqDoc);
  }));

  return router;
}
