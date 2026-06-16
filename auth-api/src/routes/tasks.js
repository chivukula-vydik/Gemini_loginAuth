import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Skill } from '../models/Skill.js';
import { canEditProject } from '../services/authz.js';

export function createTasksRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(async (req, res) => {
    const tasks = await Task.find({ assignee: req.user.sub })
      .populate('project', 'name')
      .sort('dueDate');
    res.json(tasks);
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
    for (const f of ['title', 'description', 'estimatedHours', 'assignee', 'status', 'dueDate']) {
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
