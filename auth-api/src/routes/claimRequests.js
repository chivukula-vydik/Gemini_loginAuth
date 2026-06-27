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
  router.use(requireAuth, requireRole('pm', 'admin', 'reporting_manager', 'finance', 'director', 'vp'));

  router.get('/', asyncHandler(async (req, res) => {
    const roles = req.user.roles || [req.user.role];
    let statusFilter;
    if (roles.includes('finance') && !roles.includes('admin') && !roles.includes('pm') && !roles.includes('reporting_manager')) {
      statusFilter = req.query.status || 'manager_approved';
    } else {
      statusFilter = req.query.status || 'pending';
    }
    const claims = await ClaimRequest.find({ status: statusFilter })
      .populate('userId', 'displayName email')
      .populate({ path: 'taskId', select: 'title project', populate: { path: 'project', select: 'name ownerPm' } })
      .sort('-createdAt');

    const visible = (roles.includes('finance') && !roles.includes('admin'))
      ? claims.filter((c) => c.taskId && c.taskId.project)
      : claims.filter((c) => c.taskId && c.taskId.project && canEditProject(req.user, c.taskId.project));

    res.json(visible.map((c) => ({
      _id: c._id,
      user: c.userId,
      task: { _id: c.taskId._id, title: c.taskId.title },
      project: { name: c.taskId.project.name },
      status: c.status,
      createdAt: c.createdAt,
    })));
  }));

  // Manager first-level approval
  router.patch('/:id', requireRole('pm', 'admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const claim = await ClaimRequest.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'pending') return res.status(409).json({ error: 'not in pending state' });

    const task = await Task.findById(claim.taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });

    if (decision === 'approved') {
      claim.status = 'manager_approved';
      claim.managerDecidedBy = req.user.sub;
      claim.managerDecidedAt = new Date();
      await claim.save();
    } else {
      claim.status = 'denied';
      claim.managerDecidedBy = req.user.sub;
      claim.managerDecidedAt = new Date();
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
    }
    res.json(claim);
  }));

  // Finance final sign-off
  router.patch('/:id/finance-decide', requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const claim = await ClaimRequest.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'manager_approved') {
      return res.status(409).json({ error: 'claim must be manager-approved before finance review' });
    }

    if (decision === 'approved') {
      const task = await Task.findById(claim.taskId);
      if (task && task.assignees.length === 0) {
        task.assignees = [{ user: claim.userId, sharePct: 100 }];
        await task.save();
      }
      claim.status = 'approved';
      claim.financeDecidedBy = req.user.sub;
      claim.financeDecidedAt = new Date();
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
      await ClaimRequest.updateMany(
        { taskId: claim.taskId, status: { $in: ['pending', 'manager_approved'] }, _id: { $ne: claim._id } },
        { status: 'denied', decidedBy: req.user.sub, decidedAt: new Date() },
      );
    } else {
      claim.status = 'denied';
      claim.financeDecidedBy = req.user.sub;
      claim.financeDecidedAt = new Date();
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
    }
    res.json(claim);
  }));

  return router;
}
