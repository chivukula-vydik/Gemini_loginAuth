import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Skill } from '../models/Skill.js';
import { canEditProject, canLogProgress } from '../services/authz.js';
import { actualMinutesByTask } from '../services/actuals.js';

export function createTasksRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(async (req, res) => {
    const tasks = await Task.find({ assignee: req.user.sub })
      .populate('project', 'name')
      .sort('dueDate');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    res.json(tasks.map((t) => ({ ...t.toObject(), actualMinutes: map.get(String(t._id)) || 0 })));
  }));

  router.patch('/:id/progress', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!canLogProgress(req.user, task)) return res.status(403).json({ error: 'forbidden' });
    if ('percentComplete' in (req.body || {})) {
      const p = Math.round(Number(req.body.percentComplete) || 0);
      task.percentComplete = Math.max(0, Math.min(100, p));
    }
    if ('status' in (req.body || {}) && ['todo', 'in_progress', 'blocked', 'done'].includes(req.body.status)) {
      task.status = req.body.status;
    }
    await task.save();
    res.json(task);
  }));

  router.patch('/:id/estimate', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!canLogProgress(req.user, task)) return res.status(403).json({ error: 'forbidden' });
    task.proposedHours = Math.max(0, Math.round(Number(req.body?.proposedHours) || 0));
    task.estimateStatus = 'proposed';
    await task.save();
    res.json(task);
  }));

  router.patch('/:id/estimate/decision', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    if (task.assignee && String(task.assignee) === String(req.user.sub)) {
      return res.status(403).json({ error: 'the proposer cannot approve their own estimate' });
    }
    if (decision === 'approve') {
      task.estimatedHours = task.proposedHours;
      task.estimateStatus = 'approved';
    } else {
      task.estimateStatus = 'rejected';
    }
    await task.save();
    res.json(task);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    if ('assignee' in (req.body || {}) && req.body.assignee) {
      if (!project.members.some((m) => String(m) === String(req.body.assignee))) {
        return res.status(400).json({ error: 'assignee must be a project member' });
      }
    }
    for (const f of ['title', 'description', 'assignee', 'status', 'dueDate']) {
      if (f in (req.body || {})) task[f] = req.body[f];
    }
    if (Array.isArray(req.body?.requiredSkills)) {
      const validSkills = await Skill.find({ _id: { $in: req.body.requiredSkills }, active: true }).select('_id');
      task.requiredSkills = validSkills.map((s) => s._id);
    }
    if (Array.isArray(req.body?.dependsOn)) task.dependsOn = req.body.dependsOn;
    await task.save();
    res.json(task);
  }));

  return router;
}
