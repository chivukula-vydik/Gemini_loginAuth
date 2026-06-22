import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Phase } from '../models/Phase.js';
import { Skill } from '../models/Skill.js';
import { User } from '../models/User.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { canEditProject, canLogProgress } from '../services/authz.js';
import { skillsMatch } from '../services/match.js';
import { toHours, effectiveDueDate, proposedDueDate, endDateFrom, maxAssigneeDueDate, assigneeDueDate } from '../services/estimate.js';
import { actualMinutesByTask } from '../services/actuals.js';
import { equalShares, normalizeShares } from '../services/workload.js';
import { mergeAssignees, allEstimatesIn, sumEstimatedHours, submittedCount } from '../services/assigneeEstimates.js';
import { buildEntry, upsertPending, stampOutcome, summarize } from '../services/reestimations.js';

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
      return {
        ...obj,
        actualMinutes: map.get(String(t._id)) || 0,
        effectiveDueDate: due.date,
        dueDateAuto: due.auto,
        dueProposalDate: proposedDueDate(obj),
        mySharePct: mine ? mine.sharePct : 0,
        myEstimatedHours: mine ? mine.estimatedHours ?? null : null,
        myPendingHours: mine ? mine.pendingHours ?? null : null,
        myPendingValue: mine ? mine.pendingValue ?? 0 : 0,
        myPendingUnit: mine ? mine.pendingUnit ?? 'hours' : 'hours',
        myPendingReason: mine ? mine.pendingReason ?? '' : '',
        myEstimateStatus: mine && mine.pendingHours != null ? 'pending' : 'none',
        myEtaAt: mine && mine.etaAt ? new Date(mine.etaAt).toISOString() : null,
        myDue: mine ? assigneeDueDate(obj, mine) : null,
        estimatesPending: !allEstimatesIn(obj.assignees),
        submittedCount: submittedCount(obj.assignees),
        assigneeCount: (obj.assignees || []).length,
      };
    }));
  }));

  router.post('/:id/claim', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (task.assignees.length > 0 || task.status === 'done') return res.status(400).json({ error: 'task is not claimable' });
    // Anyone whose skills match may claim, member or not — the PM still approves.
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
      if (task.status === 'done') {
        if (!task.completedAt) task.completedAt = new Date();
      } else {
        task.completedAt = null;
      }
    }
    await task.save();
    res.json(task);
  }));

  router.patch('/:id/estimate', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!canLogProgress(req.user, task)) return res.status(403).json({ error: 'forbidden' });
    if (task.assignees.length > 0) return res.status(409).json({ error: 'use per-assignee estimates for assigned tasks' });
    const unit = ['hours', 'days', 'weeks'].includes(req.body?.unit) ? req.body.unit : 'hours';
    const value = Math.max(0, Number(req.body?.value) || 0);
    task.proposedValue = value;
    task.proposedUnit = unit;
    task.proposedHours = Math.round(toHours(value, unit));
    task.estimateStatus = 'proposed';
    await task.save();
    res.json(task);
  }));

  // Assignee requests an estimate (or a change to it); recorded as pending until a PM decides.
  router.patch('/:id/my-estimate', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const mine = task.assignees.find((a) => String(a.user) === String(req.user.sub));
    if (!mine) return res.status(403).json({ error: 'not an assignee of this task' });
    const unit = ['hours', 'days', 'weeks'].includes(req.body?.unit) ? req.body.unit : 'hours';
    const value = Math.max(0, Number(req.body?.value) || 0);
    mine.pendingValue = value;
    mine.pendingUnit = unit;
    mine.pendingHours = Math.round(toHours(value, unit));
    mine.pendingReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    await task.save();

    // Part 4: record the ask permanently against the asking user.
    const project = await Project.findById(task.project).select('name');
    const user = await User.findById(req.user.sub);
    if (user) {
      const entry = buildEntry({
        taskId: task._id, taskTitle: task.title,
        projectId: task.project, projectName: project ? project.name : '',
        fromHours: mine.estimatedHours ?? 0, value, unit, toHours: mine.pendingHours,
        reason: mine.pendingReason, at: new Date(),
      });
      user.reestimations = upsertPending(user.reestimations || [], entry);
      user.reestimationCount = summarize(user.reestimations).total;
      await user.save();
    }
    res.json(task);
  }));

  // Assignee sets/updates/clears their own personal estimated completion datetime (advisory, no approval).
  router.patch('/:id/my-eta', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const mine = task.assignees.find((a) => String(a.user) === String(req.user.sub));
    if (!mine) return res.status(403).json({ error: 'not an assignee of this task' });
    const raw = req.body?.etaAt;
    if (raw == null) {
      mine.etaAt = null;
    } else {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid etaAt' });
      mine.etaAt = d;
    }
    await task.save();
    res.json(task);
  }));

  // PM/owner approves or rejects an assignee's pending estimate request.
  router.patch('/:id/my-estimate/decision', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const userId = String(req.body?.userId || '');
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    if (userId === String(req.user.sub)) {
      return res.status(403).json({ error: 'you cannot decide your own estimate request' });
    }
    const target = task.assignees.find((a) => String(a.user) === userId);
    if (!target || target.pendingHours == null) return res.status(400).json({ error: 'no pending estimate request' });
    if (decision === 'approve') target.estimatedHours = target.pendingHours;
    target.pendingHours = null;
    target.pendingValue = 0;
    target.pendingReason = '';
    if (allEstimatesIn(task.assignees)) {
      task.estimatedHours = sumEstimatedHours(task.assignees);
      if (!task.dueDate) task.dueDate = maxAssigneeDueDate(task);
    } else {
      task.estimatedHours = 0;
    }
    await task.save();

    // Part 4: stamp the matching pending entry on the assignee's history.
    const assignee = await User.findById(userId);
    if (assignee) {
      assignee.reestimations = stampOutcome(assignee.reestimations || [], task._id, decision, new Date());
      await assignee.save();
    }
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
    if ('billingType' in (req.body || {})) {
      if (!['billable', 'non-billable'].includes(req.body.billingType)) {
        return res.status(400).json({ error: 'invalid billingType' });
      }
      task.billingType = req.body.billingType;
    }
    if ('phase' in (req.body || {})) {
      if (req.body.phase) {
        const phaseDoc = await Phase.findOne({ _id: req.body.phase, project: project._id });
        if (!phaseDoc) return res.status(400).json({ error: 'phase not found on this project' });
        task.phase = phaseDoc._id;
      } else {
        task.phase = null;
      }
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
    task.assignees = mergeAssignees(task.assignees, userIds, shares);
    if (allEstimatesIn(task.assignees)) task.estimatedHours = sumEstimatedHours(task.assignees);
    else task.estimatedHours = 0;
    await task.save();
    res.json(task);
  }));

  return router;
}
