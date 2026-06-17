import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { canEditProject } from '../services/authz.js';

export function createClaimRequestsRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('pm', 'admin'));

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status || 'pending';
    const claims = await ClaimRequest.find({ status })
      .populate('userId', 'displayName email')
      .populate({ path: 'taskId', select: 'title project', populate: { path: 'project', select: 'name ownerPm' } })
      .sort('-createdAt');
    const visible = claims.filter((c) => c.taskId && c.taskId.project && canEditProject(req.user, c.taskId.project));
    res.json(visible.map((c) => ({
      _id: c._id,
      user: c.userId,
      task: { _id: c.taskId._id, title: c.taskId.title },
      project: { name: c.taskId.project.name },
      status: c.status,
      createdAt: c.createdAt,
    })));
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const claim = await ClaimRequest.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    const task = await Task.findById(claim.taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });

    if (decision === 'approved') {
      if (task.assignees.length > 0) return res.status(409).json({ error: 'task already assigned' });
      task.assignees = [{ user: claim.userId, sharePct: 100 }];
      await task.save();
      claim.status = 'approved';
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
      await ClaimRequest.updateMany(
        { taskId: task._id, status: 'pending', _id: { $ne: claim._id } },
        { status: 'denied', decidedBy: req.user.sub, decidedAt: new Date() },
      );
    } else {
      claim.status = 'denied';
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
    }
    res.json(claim);
  }));

  return router;
}
