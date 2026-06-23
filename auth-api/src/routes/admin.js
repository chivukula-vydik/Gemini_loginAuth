import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { Skill } from '../models/Skill.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Timesheet } from '../models/Timesheet.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';

const ROLES = ['admin', 'pm', 'employee', 'reporting_manager'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', asyncHandler(async (req, res) => {
    const users = await User.find().select('email displayName role active reestimationCount reportingManagerId').sort('email');
    res.json(users);
  }));

  router.patch('/users/:id/role', asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
      .select('email displayName role active');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));

  router.patch('/users/:id/active', asyncHandler(async (req, res) => {
    const active = !!req.body?.active;
    if (!active && String(req.user.sub) === String(req.params.id)) {
      return res.status(400).json({ error: 'you cannot deactivate yourself' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'not found' });
    if (!active && target.role === 'admin') {
      const otherActiveAdmins = await User.countDocuments({
        _id: { $ne: target._id }, role: 'admin', active: { $ne: false },
      });
      if (otherActiveAdmins === 0) return res.status(400).json({ error: 'cannot deactivate the last admin' });
    }
    target.active = active;
    await target.save();
    res.json({ _id: target._id, email: target.email, displayName: target.displayName, role: target.role, active: target.active });
  }));

  router.patch('/users/:id/reporting-manager', asyncHandler(async (req, res) => {
    const { reportingManagerId } = req.body || {};
    if (reportingManagerId !== null) {
      if (!reportingManagerId || !mongoose.isValidObjectId(reportingManagerId)) {
        return res.status(400).json({ error: 'invalid reportingManagerId' });
      }
      const rm = await User.findById(reportingManagerId);
      if (!rm || rm.role !== 'reporting_manager') {
        return res.status(400).json({ error: 'target user must have reporting_manager role' });
      }
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { reportingManagerId: reportingManagerId || null },
      { new: true },
    ).select('email displayName role active reportingManagerId');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));

  router.delete('/users/:id', asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (String(req.user.sub) === String(id)) {
      return res.status(400).json({ error: 'you cannot delete yourself' });
    }
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ error: 'not found' });
    if (target.role === 'admin') {
      const otherAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: 'admin' });
      if (otherAdmins === 0) return res.status(400).json({ error: 'cannot delete the last admin' });
    }
    const ownedCount = await Project.countDocuments({ ownerPm: target._id });
    if (ownedCount > 0) {
      return res.status(409).json({ error: `reassign or archive their ${ownedCount} owned project(s) first` });
    }
    await Task.updateMany({ 'assignees.user': target._id }, { $pull: { assignees: { user: target._id } } });
    await Project.updateMany({ members: target._id }, { $pull: { members: target._id } });
    await Timesheet.deleteMany({ userId: target._id });
    await RefreshToken.deleteMany({ userId: target._id });
    await PasswordResetToken.deleteMany({ userId: target._id });
    await User.deleteOne({ _id: target._id });
    res.json({ ok: true });
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
