import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createPeopleRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/birthdays/today', asyncHandler(async (_req, res) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const users = await User.find({
      active: true,
      dateOfBirth: { $ne: null },
    }).select('displayName email dateOfBirth');

    const today = users.filter((u) => {
      const dob = new Date(u.dateOfBirth);
      return dob.getMonth() + 1 === month && dob.getDate() === day;
    }).map((u) => ({
      _id: u._id,
      name: u.displayName || u.email,
      initials: initials(u.displayName || u.email),
      email: u.email,
    }));
    res.json(today);
  }));

  router.get('/birthdays/upcoming', asyncHandler(async (_req, res) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const users = await User.find({
      active: true,
      dateOfBirth: { $ne: null },
    }).select('displayName email dateOfBirth');

    const upcoming = users
      .map((u) => {
        const dob = new Date(u.dateOfBirth);
        const m = dob.getMonth() + 1;
        const d = dob.getDate();
        if (m === month && d === day) return null;
        let diff = (m - month) * 31 + (d - day);
        if (diff <= 0) diff += 365;
        return { user: u, diff, month: m, day: d };
      })
      .filter(Boolean)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 10)
      .map((entry) => {
        const u = entry.user;
        const dob = new Date(u.dateOfBirth);
        const next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
        if (next <= now) next.setFullYear(next.getFullYear() + 1);
        const diffDays = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
        let when = '';
        if (diffDays === 1) when = 'Tomorrow';
        else if (diffDays <= 7) when = `In ${diffDays} days`;
        else when = next.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

        return {
          _id: u._id,
          name: u.displayName || u.email,
          initials: initials(u.displayName || u.email),
          email: u.email,
          when,
        };
      });
    res.json(upcoming);
  }));

  router.get('/anniversaries/today', asyncHandler(async (_req, res) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const users = await User.find({
      active: true,
      dateOfJoining: { $ne: null },
    }).select('displayName email dateOfJoining');

    const today = users.filter((u) => {
      const doj = new Date(u.dateOfJoining);
      return doj.getMonth() + 1 === month && doj.getDate() === day && doj.getFullYear() < now.getFullYear();
    }).map((u) => {
      const years = now.getFullYear() - new Date(u.dateOfJoining).getFullYear();
      return {
        _id: u._id,
        name: u.displayName || u.email,
        initials: initials(u.displayName || u.email),
        email: u.email,
        years,
      };
    });
    res.json(today);
  }));

  router.get('/new-joinees', asyncHandler(async (_req, res) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const users = await User.find({
      active: true,
      dateOfJoining: { $gte: thirtyDaysAgo },
    }).select('displayName email dateOfJoining').sort({ dateOfJoining: -1 }).limit(10);

    res.json(users.map((u) => ({
      _id: u._id,
      name: u.displayName || u.email,
      initials: initials(u.displayName || u.email),
      email: u.email,
      joined: u.dateOfJoining,
    })));
  }));

  router.get('/on-leave/today', asyncHandler(async (_req, res) => {
    const today = todayYMD();
    const leaves = await Leave.find({
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today },
    }).populate('userId', 'displayName email');

    const result = leaves
      .filter((l) => l.userId)
      .map((l) => ({
        _id: l.userId._id,
        name: l.userId.displayName || l.userId.email,
        initials: initials(l.userId.displayName || l.userId.email),
        type: l.leaveType,
      }));
    res.json(result);
  }));

  router.get('/working-today', asyncHandler(async (_req, res) => {
    const today = todayYMD();
    const docs = await Attendance.find({ date: today, checkIn: { $ne: null } })
      .populate('userId', 'displayName email');

    const result = docs
      .filter((d) => d.userId)
      .map((d) => ({
        _id: d.userId._id,
        name: d.userId.displayName || d.userId.email,
        initials: initials(d.userId.displayName || d.userId.email),
      }));
    res.json(result);
  }));

  return router;
}

function initials(name) {
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name[0] || '?').toUpperCase();
}
