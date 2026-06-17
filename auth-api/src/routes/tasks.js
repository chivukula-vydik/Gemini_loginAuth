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
import { toHours, effectiveDueDate, proposedDueDate, endDateFrom } from '../services/estimate.js';
import { actualMinutesByTask } from '../services/actuals.js';
import { assigneeHours, equalShares, normalizeShares } from '../services/workload.js';

export function createTasksRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(async (req, res) => {
    const uid = String(req.user.sub);
    const tasks = await Task.find({ 'assignees.user': req.user.sub })
      .populate('project', 'name')
      .populate('assignees.user', 'displayName email')
      .sort('dueDate');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    res.json(tasks.map((t) => {
      const obj = t.toObject();
      const due = effectiveDueDate(obj);
      const mine = (obj.assignees || []).find((a) => String(a.user?._id || a.user) === uid);
      const mySharePct = mine ? mine.sharePct : 0;
      return {
        ...obj,
        actualMinutes: map.get(String(t._id)) || 0,
        effectiveDueDate: due.date,
        dueDateAuto: due.auto,
        dueProposalDate: proposedDueDate(obj),
        mySharePct,
        myPlannedHours: assigneeHours(obj.estimatedHours, mySharePct),
      };
    }));
  }));

  router.post('/:id/claim', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (task.assignees.length > 0 || task.status === 'done') return res.status(400).json({ error: 'task is not claimable' });
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
    if (task.assignees.some((a) => String(a.user) === String(req.user.sub))) {
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

  // Assignee who is behind proposes a new completion date: now + value/unit.
  router.patch('/:id/extension', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!canLogProgress(req.user, task)) return res.status(403).json({ error: 'forbidden' });
    const unit = ['hours', 'days', 'weeks'].includes(req.body?.unit) ? req.body.unit : 'days';
    const value = Math.max(0, Number(req.body?.value) || 0);
    if (value <= 0) return res.status(400).json({ error: 'value must be greater than 0' });
    task.dueProposalValue = value;
    task.dueProposalUnit = unit;
    task.dueProposalAt = new Date();
    task.dueProposalStatus = 'proposed';
    await task.save();
    res.json(task);
  }));

  // PM/owner accepts or rejects the proposed new completion date.
  router.patch('/:id/extension/decision', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (task.dueProposalStatus !== 'proposed') return res.status(400).json({ error: 'no pending extension' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    if (task.assignees.some((a) => String(a.user) === String(req.user.sub))) {
      return res.status(403).json({ error: 'the proposer cannot approve their own extension' });
    }
    if (decision === 'approve') {
      const anchorISO = (task.dueProposalAt || new Date()).toISOString().slice(0, 10);
      task.dueDate = endDateFrom(anchorISO, toHours(task.dueProposalValue, task.dueProposalUnit));
      task.dueProposalStatus = 'approved';
    } else {
      task.dueProposalStatus = 'rejected';
    }
    await task.save();
    res.json(task);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    for (const f of ['title', 'description', 'status', 'dueDate', 'startDate']) {
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

  // PM sets the full assignee team + shares directly (no offers).
  router.patch('/:id/assignees', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const input = Array.isArray(req.body?.assignees) ? req.body.assignees : [];
    // Accept [userId, ...] or [{ user, sharePct }, ...].
    const userIds = input.map((a) => String(typeof a === 'object' && a ? a.user : a));
    const memberSet = new Set(project.members.map((m) => String(m)));
    if (!userIds.every((id) => memberSet.has(id))) {
      return res.status(400).json({ error: 'every assignee must be a project member' });
    }
    const givenShares = input.map((a) => (typeof a === 'object' && a ? Number(a.sharePct) : NaN));
    const hasShares = givenShares.length > 0 && givenShares.every((s) => Number.isFinite(s));
    const shares = hasShares ? normalizeShares(givenShares) : equalShares(userIds.length);
    task.assignees = userIds.map((user, i) => ({ user, sharePct: shares[i] }));
    await task.save();
    res.json(task);
  }));

  return router;
}
