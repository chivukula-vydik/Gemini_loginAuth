import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Skill } from '../models/Skill.js';
import { User } from '../models/User.js';
import { Client } from '../models/Client.js';
import { Phase } from '../models/Phase.js';
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

const BILLING_TYPES = ['hourly', 'fixed', 'milestone'];

function normalizeBilling(input, current) {
  const billing = { type: current?.type || 'hourly', allowExpenses: current?.allowExpenses || false };
  if (input?.type !== undefined) {
    if (!BILLING_TYPES.includes(input.type)) throw new Error('invalid billing type');
    billing.type = input.type;
  }
  if (input?.allowExpenses !== undefined) billing.allowExpenses = Boolean(input.allowExpenses);
  return billing;
}

// Allocations describe a member's persistent commitment to the project (% of
// time, a date window, billing role) — every user listed must already be a
// project member.
function normalizeAllocations(input, memberSet) {
  if (!Array.isArray(input)) return null;
  for (const a of input) {
    if (!a || !memberSet.has(String(a.user))) throw new Error('every allocation must reference a project member');
  }
  return input.map((a) => ({
    user: a.user,
    allocationPct: Math.max(25, Math.min(100, Number(a.allocationPct) || 100)),
    startDate: a.startDate || null,
    endDate: a.endDate || null,
    billingRole: String(a.billingRole || ''),
  }));
}

export function createProjectsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const {
      name, description, members, startDate, targetDate, requiredSkills,
      projectCode, clientId, billing,
    } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });

    if (clientId) {
      const client = await Client.findById(clientId);
      if (!client) return res.status(400).json({ error: 'client not found' });
    }

    let billingValue;
    try { billingValue = normalizeBilling(billing); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    let project;
    try {
      project = await Project.create({
        name: String(name).trim(),
        ...(projectCode ? { projectCode: String(projectCode).trim() } : {}),
        description: String(description || ''),
        ownerPm: req.user.sub,
        clientId: clientId || null,
        members: Array.isArray(members) ? members : [],
        requiredSkills: await validActiveSkillIds(requiredSkills),
        startDate: startDate || null,
        targetDate: targetDate || null,
        billing: billingValue,
      });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'project code already in use' });
      throw e;
    }
    res.status(201).json(project);
  }));

  router.get('/', asyncHandler(async (req, res) => {
    let query;
    if (req.user.role === 'admin') query = {};
    else if (req.user.role === 'pm') query = { ownerPm: req.user.sub };
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

  router.get('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await project.populate('members', 'displayName email');
    await project.populate('ownerPm', 'displayName email role');
    await project.populate('requiredSkills', 'name active');
    await project.populate('clientId', 'name contactName contactEmail');
    await project.populate('allocations.user', 'displayName email');
    const tasks = await Task.find({ project: project._id })
      .populate('assignees.user', 'displayName email')
      .populate('phase', 'name order')
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
  router.get('/:id/candidates', asyncHandler(async (req, res) => {
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

    const users = await User.find({ active: true }).select('displayName email role skills');
    const candidates = users.map((u) => {
      const uid = String(u._id);
      const entries = entriesByUser.get(uid) || [];
      const avail = classifyAvailability(committedHours(entries));
      const userSkillSet = new Set((u.skills || []).map(String));
      const matchedSkills = requiredSkills.filter((s) => userSkillSet.has(s._id)).map((s) => s.name);
      const missingSkills = requiredSkills.filter((s) => !userSkillSet.has(s._id)).map((s) => s.name);
      return {
        _id: uid, displayName: u.displayName, email: u.email, role: u.role,
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

  router.patch('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    for (const f of ['name', 'description', 'status', 'startDate', 'targetDate']) {
      if (f in (req.body || {})) project[f] = req.body[f];
    }
    if ('projectCode' in (req.body || {})) {
      if (req.body.projectCode) {
        project.projectCode = String(req.body.projectCode).trim();
      } else {
        project.projectCode = undefined;
      }
    }
    if ('clientId' in (req.body || {})) {
      if (req.body.clientId) {
        const client = await Client.findById(req.body.clientId);
        if (!client) return res.status(400).json({ error: 'client not found' });
        project.clientId = client._id;
      } else {
        project.clientId = null;
      }
    }
    if ('billing' in (req.body || {})) {
      try { project.billing = normalizeBilling(req.body.billing, project.billing); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    }
    if (Array.isArray(req.body?.members)) {
      project.members = req.body.members;
      // Drop allocations for anyone no longer on the team.
      const stillMembers = new Set(req.body.members.map((m) => String(m)));
      project.allocations = project.allocations.filter((a) => stillMembers.has(String(a.user)));
    }
    if (Array.isArray(req.body?.requiredSkills)) project.requiredSkills = await validActiveSkillIds(req.body.requiredSkills);
    if (Array.isArray(req.body?.allocations)) {
      const memberSet = new Set(project.members.map((m) => String(m)));
      try { project.allocations = normalizeAllocations(req.body.allocations, memberSet); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    }
    if ('ownerPm' in (req.body || {}) && req.body.ownerPm) {
      const owner = await User.findById(req.body.ownerPm).select('role');
      if (!owner || !['pm', 'admin'].includes(owner.role)) {
        return res.status(400).json({ error: 'new owner must be a PM or admin' });
      }
      project.ownerPm = owner._id;
    }
    try {
      await project.save();
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'project code already in use' });
      throw e;
    }
    res.json(project);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await Task.deleteMany({ project: project._id });
    await Phase.deleteMany({ project: project._id });
    await Project.deleteOne({ _id: project._id });
    res.json({ ok: true });
  }));

  router.post('/:id/tasks', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canCreateTask(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const { title, description, requiredSkills, assignees, assignee, dueDate, startDate, dependsOn, phase, billingType } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });

    // Accept `assignees: [userId]` (preferred) or legacy single `assignee`.
    const requested = Array.isArray(assignees) ? assignees.map(String) : (assignee ? [String(assignee)] : []);
    const memberSet = new Set(project.members.map((m) => String(m)));
    if (!requested.every((uid) => memberSet.has(uid))) {
      return res.status(400).json({ error: 'every assignee must be a project member' });
    }
    const shares = equalShares(requested.length);
    const assigneeDocs = requested.map((user, i) => ({ user, sharePct: shares[i] }));

    let phaseId = null;
    if (phase) {
      const phaseDoc = await Phase.findOne({ _id: phase, project: project._id });
      if (!phaseDoc) return res.status(400).json({ error: 'phase not found on this project' });
      phaseId = phaseDoc._id;
    }
    if (billingType !== undefined && !['billable', 'non-billable'].includes(billingType)) {
      return res.status(400).json({ error: 'invalid billingType' });
    }

    const skillIds = Array.isArray(requiredSkills) ? requiredSkills : [];
    const validSkills = await Skill.find({ _id: { $in: skillIds }, active: true }).select('_id');
    const task = await Task.create({
      project: project._id,
      phase: phaseId,
      billingType: billingType || 'billable',
      title: String(title).trim(),
      description: String(description || ''),
      requiredSkills: validSkills.map((s) => s._id),
      assignees: assigneeDocs,
      dueDate: dueDate || null,
      startDate: startDate || null,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      createdBy: req.user.sub,
    });
    res.status(201).json(task);
  }));

  // --- Phases ---

  router.get('/:id/phases', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const phases = await Phase.find({ project: project._id }).sort('order');
    res.json(phases);
  }));

  router.post('/:id/phases', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const { name, order } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const phase = await Phase.create({
      project: project._id,
      name: String(name).trim(),
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
    });
    res.status(201).json(phase);
  }));

  router.patch('/phases/:phaseId', asyncHandler(async (req, res) => {
    const phase = await Phase.findById(req.params.phaseId);
    if (!phase) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(phase.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    if ('name' in (req.body || {})) phase.name = String(req.body.name || '').trim() || phase.name;
    if ('order' in (req.body || {})) phase.order = Number(req.body.order) || 0;
    await phase.save();
    res.json(phase);
  }));

  router.delete('/phases/:phaseId', asyncHandler(async (req, res) => {
    const phase = await Phase.findById(req.params.phaseId);
    if (!phase) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(phase.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await Task.updateMany({ phase: phase._id }, { $set: { phase: null } });
    await phase.deleteOne();
    res.json({ ok: true });
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
