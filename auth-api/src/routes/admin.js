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
import { Department } from '../models/Department.js';
import { Shift } from '../models/Shift.js';
import { LeaveBalance, QUOTA_LEAVE_TYPES, getOrCreateBalance } from '../models/LeaveBalance.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Role } from '../models/Role.js';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', asyncHandler(async (req, res) => {
    const users = await User.find().select('email displayName roles role active reestimationCount reportingManagerId departmentId shiftId').sort('email');
    res.json(users.map((u) => ({ ...u.toObject(), roles: u.roles?.length ? u.roles : [u.role || 'employee'] })));
  }));

  router.get('/users/:id/detail', asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
      .select('email displayName roles active employeeCode phone dateOfBirth dateOfJoining employmentType probationEndDate skills providers createdAt attendanceActivatedDate')
      .populate('departmentId', 'name')
      .populate('designationId', 'name')
      .populate('locationId', 'name')
      .populate('legalEntityId', 'name')
      .populate('businessUnitId', 'name')
      .populate('shiftId', 'name startTime endTime')
      .populate('reportingManagerId', 'displayName email')
      .populate('skills', 'name');
    if (!user) return res.status(404).json({ error: 'not found' });

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [attendance, leaves, leaveBalance, tasks, timesheets] = await Promise.all([
      Attendance.find({ userId: user._id }).sort({ date: -1 }).limit(30).lean(),
      Leave.find({ userId: user._id }).sort({ startDate: -1 }).limit(20).lean(),
      getOrCreateBalance(user._id, now.getFullYear()),
      Task.find({ 'assignees.user': user._id }).populate('project', 'name').sort({ dueDate: -1 }).limit(20).lean(),
      Timesheet.find({ userId: user._id }).sort({ weekStart: -1 }).limit(8).lean(),
    ]);

    const attendanceStats = {
      totalDays: attendance.length,
      presentDays: attendance.filter((a) => a.status === 'present' || a.status === 'wfh').length,
      wfhDays: attendance.filter((a) => a.status === 'wfh').length,
      avgEffective: attendance.length > 0 ? Math.round(attendance.reduce((s, a) => s + (a.effectiveMinutes || 0), 0) / attendance.length) : 0,
    };

    res.json({
      profile: user,
      attendance: attendance.slice(0, 15),
      attendanceStats,
      leaves,
      leaveBalance: {
        casual: leaveBalance.casual,
        sick: leaveBalance.sick,
        earned: leaveBalance.earned,
        year: leaveBalance.year,
      },
      tasks,
      timesheets,
    });
  }));

  router.patch('/users/:id/roles', asyncHandler(async (req, res) => {
    const { roles } = req.body || {};
    if (!Array.isArray(roles) || roles.length === 0) return res.status(400).json({ error: 'roles must be a non-empty array' });
    const validRoles = await Role.find({ active: true }).distinct('name');
    if (roles.some((r) => !validRoles.includes(r))) return res.status(400).json({ error: 'invalid role in array' });
    const unique = [...new Set(roles)];
    const user = await User.findByIdAndUpdate(req.params.id, { roles: unique, $unset: { role: 1 } }, { new: true })
      .select('email displayName roles active');
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
    if (!active && (target.roles?.length ? target.roles : [target.role]).includes('admin')) {
      const otherActiveAdmins = await User.countDocuments({
        _id: { $ne: target._id }, roles: 'admin', active: { $ne: false },
      });
      if (otherActiveAdmins === 0) return res.status(400).json({ error: 'cannot deactivate the last admin' });
    }
    target.active = active;
    await target.save();
    res.json({ _id: target._id, email: target.email, displayName: target.displayName, roles: target.roles?.length ? target.roles : [target.role || 'employee'], active: target.active });
  }));

  router.patch('/users/:id/reporting-manager', asyncHandler(async (req, res) => {
    const { reportingManagerId } = req.body || {};
    if (reportingManagerId !== null) {
      if (!reportingManagerId || !mongoose.isValidObjectId(reportingManagerId)) {
        return res.status(400).json({ error: 'invalid reportingManagerId' });
      }
      const rm = await User.findById(reportingManagerId);
      if (!rm || !(rm.roles?.length ? rm.roles : [rm.role]).includes('reporting_manager')) {
        return res.status(400).json({ error: 'target user must have reporting_manager role' });
      }
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { reportingManagerId: reportingManagerId || null },
      { new: true },
    ).select('email displayName roles role active reportingManagerId');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({ ...user.toObject(), roles: user.roles?.length ? user.roles : [user.role || 'employee'] });
  }));

  router.delete('/users/:id', asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (String(req.user.sub) === String(id)) {
      return res.status(400).json({ error: 'you cannot delete yourself' });
    }
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ error: 'not found' });
    if ((target.roles?.length ? target.roles : [target.role]).includes('admin')) {
      const otherAdmins = await User.countDocuments({ _id: { $ne: target._id }, roles: 'admin' });
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

  // --- Departments ---
  router.get('/departments', asyncHandler(async (_req, res) => {
    const deps = await Department.find().sort('name');
    res.json(deps);
  }));

  router.post('/departments', asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const dep = await Department.create({ name, description: req.body?.description || '' });
    res.status(201).json(dep);
  }));

  router.patch('/departments/:id', asyncHandler(async (req, res) => {
    const update = {};
    if (typeof req.body?.name === 'string') update.name = req.body.name.trim();
    if (typeof req.body?.description === 'string') update.description = req.body.description;
    if (typeof req.body?.active === 'boolean') update.active = req.body.active;
    const dep = await Department.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!dep) return res.status(404).json({ error: 'not found' });
    res.json(dep);
  }));

  router.delete('/departments/:id', asyncHandler(async (req, res) => {
    const count = await User.countDocuments({ departmentId: req.params.id });
    if (count > 0) return res.status(409).json({ error: `${count} user(s) still in this department` });
    await Department.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  // --- Shifts ---
  router.get('/shifts', asyncHandler(async (_req, res) => {
    const shifts = await Shift.find().sort('name');
    res.json(shifts);
  }));

  router.post('/shifts', asyncHandler(async (req, res) => {
    const { name, startHour, startMinute, endHour, endMinute, isDefault } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (startHour == null || endHour == null) return res.status(400).json({ error: 'start/end hours required' });
    if (isDefault) await Shift.updateMany({ isDefault: true }, { isDefault: false });
    const shift = await Shift.create({ name: name.trim(), startHour, startMinute: startMinute || 0, endHour, endMinute: endMinute || 0, isDefault: !!isDefault });
    res.status(201).json(shift);
  }));

  router.patch('/shifts/:id', asyncHandler(async (req, res) => {
    const update = {};
    if (typeof req.body?.name === 'string') update.name = req.body.name.trim();
    if (req.body?.startHour != null) update.startHour = req.body.startHour;
    if (req.body?.startMinute != null) update.startMinute = req.body.startMinute;
    if (req.body?.endHour != null) update.endHour = req.body.endHour;
    if (req.body?.endMinute != null) update.endMinute = req.body.endMinute;
    if (typeof req.body?.active === 'boolean') update.active = req.body.active;
    if (typeof req.body?.isDefault === 'boolean') {
      if (req.body.isDefault) await Shift.updateMany({ isDefault: true }, { isDefault: false });
      update.isDefault = req.body.isDefault;
    }
    const shift = await Shift.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!shift) return res.status(404).json({ error: 'not found' });
    res.json(shift);
  }));

  router.delete('/shifts/:id', asyncHandler(async (req, res) => {
    const count = await User.countDocuments({ shiftId: req.params.id });
    if (count > 0) return res.status(409).json({ error: `${count} user(s) still on this shift` });
    await Shift.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  // --- Leave balance ---
  router.get('/users/:id/leave-balance', asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('_id');
    if (!user) return res.status(404).json({ error: 'not found' });
    const year = Number(req.query.year) || new Date().getFullYear();
    const balance = await getOrCreateBalance(user._id, year);
    res.json(balance);
  }));

  router.patch('/users/:id/leave-balance', asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('_id');
    if (!user) return res.status(404).json({ error: 'not found' });
    const year = Number(req.body?.year) || new Date().getFullYear();
    const balance = await getOrCreateBalance(user._id, year);
    for (const type of QUOTA_LEAVE_TYPES) {
      if (req.body?.[type]?.total != null) {
        const total = Number(req.body[type].total);
        if (total < 0) return res.status(400).json({ error: `${type} total cannot be negative` });
        balance[type].total = total;
      }
      if (req.body?.[type]?.used != null) {
        const used = Number(req.body[type].used);
        if (used < 0) return res.status(400).json({ error: `${type} used cannot be negative` });
        balance[type].used = used;
      }
    }
    await balance.save();
    res.json(balance);
  }));

  // --- Assign department/shift to user ---
  router.patch('/users/:id/department', asyncHandler(async (req, res) => {
    const { departmentId } = req.body || {};
    const user = await User.findByIdAndUpdate(req.params.id, { departmentId: departmentId || null }, { new: true })
      .select('email displayName roles active departmentId shiftId');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));

  router.patch('/users/:id/shift', asyncHandler(async (req, res) => {
    const { shiftId } = req.body || {};
    const user = await User.findByIdAndUpdate(req.params.id, { shiftId: shiftId || null }, { new: true })
      .select('email displayName roles active departmentId shiftId');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));

  // --- Roles ---
  router.get('/roles', asyncHandler(async (_req, res) => {
    const roles = await Role.find({ active: true }).sort('name');
    res.json(roles);
  }));

  router.post('/roles', asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim().toLowerCase().replace(/\s+/g, '_');
    const label = String(req.body?.label || req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const exists = await Role.findOne({ name });
    if (exists) return res.status(409).json({ error: 'role already exists' });
    const role = await Role.create({ name, label });
    res.status(201).json(role);
  }));

  router.patch('/roles/:id', asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'not found' });
    const update = {};
    if (typeof req.body?.label === 'string') update.label = req.body.label.trim();
    if (typeof req.body?.active === 'boolean') update.active = req.body.active;
    const updated = await Role.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(updated);
  }));

  router.delete('/roles/:id', asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'not found' });
    const count = await User.countDocuments({ roles: role.name });
    if (count > 0) return res.status(409).json({ error: `${count} user(s) still have this role` });
    await Role.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  return router;
}
