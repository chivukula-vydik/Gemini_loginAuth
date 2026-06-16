import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
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
    for (const f of ['title', 'description', 'estimatedHours', 'assignee', 'status', 'dueDate']) {
      if (f in (req.body || {})) task[f] = req.body[f];
    }
    if (Array.isArray(req.body?.requiredSkills)) task.requiredSkills = req.body.requiredSkills;
    if (Array.isArray(req.body?.dependsOn)) task.dependsOn = req.body.dependsOn;
    await task.save();
    res.json(task);
  }));

  return router;
}
