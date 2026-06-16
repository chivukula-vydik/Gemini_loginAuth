import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Skill } from '../models/Skill.js';
import { User } from '../models/User.js';
import { canViewProject, canEditProject, canCreateTask } from '../services/authz.js';
import { actualMinutesByTask } from '../services/actuals.js';

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
    res.json(projects);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await project.populate('members', 'displayName email');
    await project.populate('ownerPm', 'displayName email role');
    const tasks = await Task.find({ project: project._id })
      .populate('assignee', 'displayName email')
      .sort('createdAt');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    const tasksOut = tasks.map((t) => ({ ...t.toObject(), actualMinutes: map.get(String(t._id)) || 0 }));
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
    const { title, description, requiredSkills, assignee, dueDate, dependsOn } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    if (assignee && !project.members.some((m) => String(m) === String(assignee))) {
      return res.status(400).json({ error: 'assignee must be a project member' });
    }
    const skillIds = Array.isArray(requiredSkills) ? requiredSkills : [];
    const validSkills = await Skill.find({ _id: { $in: skillIds }, active: true }).select('_id');
    const task = await Task.create({
      project: project._id,
      title: String(title).trim(),
      description: String(description || ''),
      requiredSkills: validSkills.map((s) => s._id),
      assignee: assignee || null,
      dueDate: dueDate || null,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      createdBy: req.user.sub,
    });
    res.status(201).json(task);
  }));

  return router;
}
