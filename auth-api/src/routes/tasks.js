import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Skill } from '../models/Skill.js';
import { User } from '../models/User.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { canEditProject, canLogProgress } from '../services/authz.js';
import { skillsMatch } from '../services/match.js';
import { toHours } from '../services/estimate.js';
import { actualMinutesByTask } from '../services/actuals.js';
import { AssignmentOffer } from '../models/AssignmentOffer.js';
import { hasActiveTask } from '../services/assignment.js';

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

  router.post('/:id/claim', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (task.assignee || task.status === 'done') return res.status(400).json({ error: 'task is not claimable' });
    const project = await Project.findById(task.project);
    if (!project || !project.members.some((m) => String(m) === String(req.user.sub))) {
      return res.status(400).json({ error: 'you are not a member of this project' });
    }
    const me = await User.findById(req.user.sub).select('skills');
    if (!skillsMatch(task.requiredSkills, me?.skills || [])) {
      return res.status(400).json({ error: 'your skills do not match this task' });
    }
    const existing = await ClaimRequest.findOne({ taskId: task._id, userId: req.user.sub, status: 'pending' });
    if (existing) return res.status(409).json({ error: 'you already have a pending claim on this task' });
    const claim = await ClaimRequest.create({ taskId: task._id, userId: req.user.sub });
    res.status(201).json(claim);
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
    const unit = ['hours', 'days', 'weeks'].includes(req.body?.unit) ? req.body.unit : 'hours';
    const value = Math.max(0, Number(req.body?.value) || 0);
    task.proposedValue = value;
    task.proposedUnit = unit;
    task.proposedHours = Math.round(toHours(value, unit));
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
      task.estimateValue = task.proposedValue;
      task.estimateUnit = task.proposedUnit;
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
    let offered = false;
    if ('assignee' in (req.body || {}) && req.body.assignee) {
      if (!project.members.some((m) => String(m) === String(req.body.assignee))) {
        return res.status(400).json({ error: 'assignee must be a project member' });
      }
      const sameAssignee = task.assignee && String(task.assignee) === String(req.body.assignee);
      if (!sameAssignee && (await hasActiveTask(req.body.assignee))) {
        const dup = await AssignmentOffer.exists({ taskId: task._id, userId: req.body.assignee, status: 'pending' });
        if (!dup) await AssignmentOffer.create({ taskId: task._id, userId: req.body.assignee, offeredBy: req.user.sub });
        offered = true;
      }
    }
    for (const f of ['title', 'description', 'status', 'dueDate', 'startDate']) {
      if (f in (req.body || {})) task[f] = req.body[f];
    }
    if ('assignee' in (req.body || {}) && !offered) task.assignee = req.body.assignee;
    if (Array.isArray(req.body?.requiredSkills)) {
      const validSkills = await Skill.find({ _id: { $in: req.body.requiredSkills }, active: true }).select('_id');
      task.requiredSkills = validSkills.map((s) => s._id);
    }
    if (Array.isArray(req.body?.dependsOn)) task.dependsOn = req.body.dependsOn;
    await task.save();
    res.json(offered ? { ...task.toObject(), offered: true } : task);
  }));

  return router;
}
