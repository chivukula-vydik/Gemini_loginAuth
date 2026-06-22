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

  router.post('/', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const { name, description, members, startDate, targetDate, requiredSkills } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const project = await Project.create({
      name: String(name).trim(),
      description: String(description || ''),
      ownerPm: req.user.sub,
      members: Array.isArray(members) ? members : [],
      requiredSkills: await validActiveSkillIds(requiredSkills),
      startDate: startDate || null,
      targetDate: targetDate || null,
    });
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
    if (Array.isArray(req.body?.members)) project.members = req.body.members;
    if (Array.isArray(req.body?.requiredSkills)) project.requiredSkills = await validActiveSkillIds(req.body.requiredSkills);
    if ('ownerPm' in (req.body || {}) && req.body.ownerPm) {
      const owner = await User.findById(req.body.ownerPm).select('role');
      if (!owner || !['pm', 'admin'].includes(owner.role)) {
        return res.status(400).json({ error: 'new owner must be a PM or admin' });
      }
      project.ownerPm = owner._id;
    }
    await project.save();
    res.json(project);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await Task.deleteMany({ project: project._id });
    await Project.deleteOne({ _id: project._id });
    res.json({ ok: true });
  }));

  router.post('/:id/tasks', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canCreateTask(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const { title, description, requiredSkills, assignees, assignee, dueDate, startDate, dependsOn } = req.body || {};
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
