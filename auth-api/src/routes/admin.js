import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { Skill } from '../models/Skill.js';

const ROLES = ['admin', 'pm', 'employee'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', asyncHandler(async (req, res) => {
    const users = await User.find().select('email displayName role').sort('email');
    res.json(users);
  }));

  router.patch('/users/:id/role', asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
      .select('email displayName role');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));

  router.post('/skills', asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const exists = await Skill.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (exists) return res.status(409).json({ error: 'skill already exists' });
    const skill = await Skill.create({ name });
    res.status(201).json(skill);
  }));

  router.patch('/skills/:id', asyncHandler(async (req, res) => {
    const update = {};
    if (typeof req.body?.name === 'string') update.name = req.body.name.trim();
    if (typeof req.body?.active === 'boolean') update.active = req.body.active;
    const skill = await Skill.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!skill) return res.status(404).json({ error: 'not found' });
    res.json(skill);
  }));

  return router;
}
