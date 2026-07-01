import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Skill } from '../models/Skill.js';
import { User } from '../models/User.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { canViewProject, canEditProject, canCreateTask } from '../services/authz.js';
import { actualMinutesByTask } from '../services/actuals.js';
import { effectiveDueDate, proposedDueDate } from '../services/estimate.js';
import { equalShares } from '../services/workload.js';
import { skillsMatch } from '../services/match.js';
import { CAPACITY_HOURS, committedHours, classifyAvailability } from '../services/staffing.js';

// Keeps only ids that refer to active skills. Returns [] for a non-array input.
async function validActiveSkillIds(ids) {
  if (!Array.isArray(ids)) return [];
  const valid = ids.filter((id) => mongoose.isValidObjectId(id));
  if (valid.length === 0) return [];
  const found = await Skill.find({ _id: { $in: valid }, active: true }).select('_id');
  return found.map((s) => s._id);
}

export function createProjectsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const { name, description, members, startDate, targetDate, requiredSkills, clientName, billingType, billingRate, currency, milestones, phases } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    if (!clientName || !String(clientName).trim()) return res.status(400).json({ error: 'clientName required' });
    const validBilling = ['billable', 'non-billable', 'milestone', 'hourly', 'fixed-price'];
    const cleanPhases = Array.isArray(phases) ? phases.map((p, i) => ({ name: String(p.name || '').trim() || `Phase ${i + 1}`, description: p.description || '', order: i, status: i === 0 ? 'active' : 'upcoming' })) : [];
    const project = await Project.create({
      name: String(name).trim(),
      description: String(description || ''),
      ownerPm: req.user.sub,
      members: Array.isArray(members) ? members : [],
      requiredSkills: await validActiveSkillIds(requiredSkills),
      startDate: startDate || null,
      targetDate: targetDate || null,
      clientName: String(clientName).trim(),
      billingType: validBilling.includes(billingType) ? billingType : 'non-billable',
      billingRate: billingRate != null ? Number(billingRate) : null,
      currency: currency ? String(currency) : null,
      milestones: Array.isArray(milestones) ? milestones : [],
      phases: cleanPhases,
      activePhase: null,
    });
    if (project.phases.length > 0) {
      project.activePhase = project.phases[0]._id;
      await project.save();
    }
    res.status(201).json(project);
  }));

  router.get('/', requireFeature('projects'), asyncHandler(async (req, res) => {
    let query;
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (roles.includes('admin')) query = {};
    else if (roles.includes('pm')) query = { ownerPm: req.user.sub };
    else query = { members: req.user.sub };
    const projects = await Project.find(query).sort('-createdAt');

    // Aggregate task progress per project so the list can show state at a glance.
    const ids = projects.map((p) => p._id);
    const agg = ids.length ? await Task.aggregate([
      { $match: { project: { $in: ids } } },
      { $group: {
        _id: '$project',
        taskCount: { $sum: 1 },
        doneCount: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        avgPct: { $avg: { $ifNull: ['$percentComplete', 0] } },
      } },
    ]) : [];
    const stats = new Map(agg.map((a) => [String(a._id), a]));

    const out = projects.map((p) => {
      const a = stats.get(String(p._id));
      return {
        ...p.toObject(),
        taskCount: a ? a.taskCount : 0,
        doneCount: a ? a.doneCount : 0,
        progress: a ? Math.round(a.avgPct) : 0,
      };
    });
    res.json(out);
  }));

  router.get('/:id', requireFeature('projects'), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await project.populate('members', 'displayName email');
    await project.populate('ownerPm', 'displayName email role');
    await project.populate('requiredSkills', 'name active');
    const tasks = await Task.find({ project: project._id })
      .populate('assignees.user', 'displayName email')
      .sort('createdAt');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    const tasksOut = tasks.map((t) => {
      const obj = t.toObject();
      const due = effectiveDueDate(obj);
      return {
        ...obj,
        actualMinutes: map.get(String(t._id)) || 0,
        effectiveDueDate: due.date,
        dueDateAuto: due.auto,
        dueProposalDate: proposedDueDate(obj),
      };
    });
    res.json({ project, tasks: tasksOut });
  }));

  // Capacity-aware candidate list: each active user's committed hours vs. cap,
  // availability, and skill match against the project's required skills. PM/admin only.
  router.get('/:id/candidates', requireFeature('projects'), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id).populate('requiredSkills', 'name');
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });

    const requiredSkills = (project.requiredSkills || []).map((s) => ({ _id: String(s._id), name: s.name }));
    const requiredIds = requiredSkills.map((s) => s._id);
    const memberSet = new Set((project.members || []).map((m) => String(m)));

    // One pass over active tasks → committed-hours entries per user.
    const tasks = await Task.find({ status: { $ne: 'done' } }).select('status estimatedHours assignees');
    const entriesByUser = new Map();
    for (const t of tasks) {
      for (const a of t.assignees || []) {
        const uid = String(a.user);
        const arr = entriesByUser.get(uid) || [];
        arr.push({ status: t.status, estimatedHours: a.estimatedHours, taskEstimatedHours: t.estimatedHours, sharePct: a.sharePct });
        entriesByUser.set(uid, arr);
      }
    }

    const users = await User.find({ active: true }).select('displayName email role roles skills');
    const candidates = users.map((u) => {
      const uid = String(u._id);
      const entries = entriesByUser.get(uid) || [];
      const avail = classifyAvailability(committedHours(entries));
      const userSkillSet = new Set((u.skills || []).map(String));
      const matchedSkills = requiredSkills.filter((s) => userSkillSet.has(s._id)).map((s) => s.name);
      const missingSkills = requiredSkills.filter((s) => !userSkillSet.has(s._id)).map((s) => s.name);
      return {
        _id: uid, displayName: u.displayName, email: u.email, roles: u.roles?.length ? u.roles : [u.role || 'employee'],
        ...avail,
        skillsOk: skillsMatch(requiredIds, [...userSkillSet]),
        matchedSkills, missingSkills,
        activeTaskCount: entries.length, // open (non-done) assignments
        isMember: memberSet.has(uid),
      };
    });

    // Best picks first: skill-matched, then most available; maxed-out last.
    candidates.sort((a, b) => (a.skillsOk !== b.skillsOk ? (a.skillsOk ? -1 : 1) : a.hours - b.hours));

    res.json({ capacity: CAPACITY_HOURS, requiredSkills, candidates });
  }));

  router.patch('/:id', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    for (const f of ['name', 'description', 'status', 'startDate', 'targetDate', 'clientName', 'billingType', 'billingRate', 'currency']) {
      if (f in (req.body || {})) project[f] = req.body[f];
    }
    if (Array.isArray(req.body?.members)) project.members = req.body.members;
    if (Array.isArray(req.body?.requiredSkills)) project.requiredSkills = await validActiveSkillIds(req.body.requiredSkills);
    if ('ownerPm' in (req.body || {}) && req.body.ownerPm) {
      const owner = await User.findById(req.body.ownerPm).select('role roles');
      if (!owner || !(owner.roles?.length ? owner.roles : [owner.role]).some((r) => ['pm', 'admin'].includes(r))) {
        return res.status(400).json({ error: 'new owner must be a PM or admin' });
      }
      project.ownerPm = owner._id;
    }
    await project.save();
    res.json(project);
  }));

  router.delete('/:id', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await Task.deleteMany({ project: project._id });
    await Project.deleteOne({ _id: project._id });
    res.json({ ok: true });
  }));

  // --- Phase management ---
  router.post('/:id/phases', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const { name, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const order = project.phases.length;
    project.phases.push({ name: name.trim(), description: description || '', order, status: project.phases.length === 0 ? 'active' : 'upcoming' });
    if (!project.activePhase && project.phases.length === 1) project.activePhase = project.phases[0]._id;
    await project.save();
    res.status(201).json(project.phases);
  }));

  router.patch('/:id/phases/:phaseId', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const phase = project.phases.id(req.params.phaseId);
    if (!phase) return res.status(404).json({ error: 'phase not found' });
    if (req.body?.name) phase.name = req.body.name.trim();
    if (req.body?.description != null) phase.description = req.body.description;
    if (req.body?.status && ['upcoming', 'active', 'completed'].includes(req.body.status)) {
      phase.status = req.body.status;
      if (req.body.status === 'active') project.activePhase = phase._id;
    }
    await project.save();
    res.json(project.phases);
  }));

  router.post('/:id/phases/advance', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const sorted = [...project.phases].sort((a, b) => a.order - b.order);
    const activeIdx = sorted.findIndex((p) => String(p._id) === String(project.activePhase));
    if (activeIdx === -1 || activeIdx >= sorted.length - 1) return res.status(400).json({ error: 'no next phase' });
    sorted[activeIdx].status = 'completed';
    sorted[activeIdx + 1].status = 'active';
    project.activePhase = sorted[activeIdx + 1]._id;
    await project.save();
    res.json(project.phases);
  }));

  router.delete('/:id/phases/:phaseId', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const taskCount = await Task.countDocuments({ project: project._id, phaseId: req.params.phaseId });
    if (taskCount > 0) return res.status(409).json({ error: `${taskCount} task(s) still in this phase — reassign them first` });
    project.phases.pull({ _id: req.params.phaseId });
    if (String(project.activePhase) === req.params.phaseId) {
      const first = project.phases.sort((a, b) => a.order - b.order)[0];
      project.activePhase = first ? first._id : null;
    }
    await project.save();
    res.json(project.phases);
  }));

  // --- Milestone management ---
  router.patch('/:id/milestones/:milestoneId', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const ms = project.milestones.id(req.params.milestoneId);
    if (!ms) return res.status(404).json({ error: 'milestone not found' });
    if (req.body?.name != null) ms.name = String(req.body.name).trim();
    if (req.body?.amount != null) ms.amount = Number(req.body.amount);
    if (req.body?.description != null) ms.description = String(req.body.description);
    if (req.body?.status && ['pending', 'in_progress', 'completed', 'paid'].includes(req.body.status)) {
      ms.status = req.body.status;
    }
    await project.save();
    res.json(project.milestones);
  }));

  router.post('/:id/tasks', requireFeature('projects', { write: true }), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canCreateTask(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const { title, description, requiredSkills, assignees, assignee, dueDate, startDate, dependsOn, phaseId } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });

    // Accept `assignees: [userId]` (preferred) or legacy single `assignee`.
    const requested = Array.isArray(assignees) ? assignees.map(String) : (assignee ? [String(assignee)] : []);
    const memberSet = new Set(project.members.map((m) => String(m)));
    if (!requested.every((uid) => memberSet.has(uid))) {
      return res.status(400).json({ error: 'every assignee must be a project member' });
    }
    const shares = equalShares(requested.length);
    const assigneeDocs = requested.map((user, i) => ({ user, sharePct: shares[i] }));

    const skillIds = Array.isArray(requiredSkills) ? requiredSkills : [];
    const validSkills = await Skill.find({ _id: { $in: skillIds }, active: true }).select('_id');
    const task = await Task.create({
      project: project._id,
      title: String(title).trim(),
      description: String(description || ''),
      requiredSkills: validSkills.map((s) => s._id),
      assignees: assigneeDocs,
      dueDate: dueDate || null,
      startDate: startDate || null,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      phaseId: phaseId || (project.activePhase || null),
      createdBy: req.user.sub,
    });
    res.status(201).json(task);
  }));

  router.patch('/:id/tasks/bulk', requireFeature('pmTaskBulk'), asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });

    const taskIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds.map(String) : [];
    if (taskIds.length === 0) return res.status(400).json({ error: 'taskIds required' });

    const tasks = await Task.find({ _id: { $in: taskIds }, project: project._id }).select('_id');
    if (tasks.length !== taskIds.length) {
      return res.status(400).json({ error: 'every taskId must belong to this project' });
    }

    const op = req.body?.op;
    if (!['status', 'assignee', 'delete'].includes(op)) {
      return res.status(400).json({ error: 'invalid op' });
    }

    if (op === 'delete') {
      await Task.deleteMany({ _id: { $in: taskIds }, project: project._id });
      return res.json({ ok: true, count: taskIds.length });
    }

    if (op === 'status') {
      const value = req.body?.value;
      if (!['todo', 'in_progress', 'blocked', 'done'].includes(value)) {
        return res.status(400).json({ error: 'invalid status value' });
      }
      await Task.updateMany(
        { _id: { $in: taskIds }, project: project._id },
        { $set: { status: value } },
      );
      return res.json({ ok: true, count: taskIds.length });
    }

    const assigneeId = String(req.body?.value || '');
    const memberSet = new Set(project.members.map((m) => String(m)));
    if (!assigneeId || !memberSet.has(assigneeId)) {
      return res.status(400).json({ error: 'assignee must be a project member' });
    }
    await Task.updateMany(
      { _id: { $in: taskIds }, project: project._id },
      { $set: { assignees: [{ user: assigneeId, sharePct: 100 }] } },
    );
    return res.json({ ok: true, count: taskIds.length });
  }));

  return router;
}
