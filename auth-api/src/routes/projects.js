import express from 'express';
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

export function createProjectsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const { name, description, members, startDate, targetDate } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const project = await Project.create({
      name: String(name).trim(),
      description: String(description || ''),
      ownerPm: req.user.sub,
      members: Array.isArray(members) ? members : [],
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

  router.patch('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    for (const f of ['name', 'description', 'status', 'startDate', 'targetDate']) {
      if (f in (req.body || {})) project[f] = req.body[f];
    }
    if (Array.isArray(req.body?.members)) project.members = req.body.members;
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
