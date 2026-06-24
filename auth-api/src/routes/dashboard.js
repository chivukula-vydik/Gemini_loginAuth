import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Attendance, todayStr } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { getOrCreateBalance, remaining } from '../models/LeaveBalance.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { EditRequest } from '../models/EditRequest.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { currentMonday, DAYS } from '../services/timesheetRows.js';

const TEAM_ROLES = ['admin', 'pm', 'reporting_manager'];

function greetingText() {
  const h = new Date().getHours();
  if (h >= 5 && h <= 11) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}

function deriveAttendanceStatus(doc) {
  if (!doc || !doc.checkIn) return 'idle';
  if (doc.checkOut) return 'done';
  return (doc.breaks || []).some((b) => !b.end) ? 'on-break' : 'in';
}

async function teamMemberIds(userId, role) {
  if (role === 'admin') {
    const users = await User.find({ active: { $ne: false } }).select('_id');
    return users.map((u) => u._id);
  }
  if (role === 'reporting_manager') {
    const users = await User.find({ reportingManagerId: userId }).select('_id');
    return users.map((u) => u._id);
  }
  // PM: members across owned projects
  const projects = await Project.find({ ownerPm: userId }).select('members');
  const set = new Set();
  for (const p of projects) {
    for (const m of p.members || []) set.add(String(m));
  }
  return Array.from(set);
}

export function createDashboardRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(async (req, res) => {
    const userId = req.user.sub;
    const roles = req.user.roles || [req.user.role || 'employee'];
    const result = { greeting: greetingText() };

    // --- attendance ---
    try {
      const today = todayStr();
      const doc = await Attendance.findOne({ userId, date: today });
      const shiftDuration = req.app.locals.shiftConfig?.durationMinutes || 540;
      let effectiveMinutes = 0;
      if (doc && doc.checkIn) {
        if (doc.checkOut) {
          effectiveMinutes = doc.effectiveMinutes || 0;
        } else {
          const gross = (Date.now() - new Date(doc.checkIn).getTime()) / 60000;
          const breakMins = (doc.breakMinutes || 0) +
            ((doc.breaks || []).find((b) => !b.end)
              ? (Date.now() - new Date((doc.breaks || []).find((b) => !b.end).start).getTime()) / 60000
              : 0);
          effectiveMinutes = Math.max(0, Math.round(gross - breakMins));
        }
      }
      result.attendance = {
        status: deriveAttendanceStatus(doc),
        checkIn: doc?.checkIn || null,
        effectiveMinutes,
        shiftDuration,
      };
    } catch (_) { /* omit section */ }

    // --- leave ---
    try {
      const year = new Date().getFullYear();
      const balance = await getOrCreateBalance(userId, year);
      const pendingCount = await Leave.countDocuments({ userId, status: 'pending' });
      result.leave = {
        casual: { remaining: remaining(balance, 'casual'), total: balance.casual.total },
        sick: { remaining: remaining(balance, 'sick'), total: balance.sick.total },
        earned: { remaining: remaining(balance, 'earned'), total: balance.earned.total },
        pendingCount,
      };
    } catch (_) { /* omit section */ }

    // --- timesheet ---
    try {
      const weekStart = currentMonday();
      const ts = await Timesheet.findOne({ userId, weekStart });
      let totalMinutes = 0;
      let billableMinutes = 0;
      let submittedDays = 0;
      if (ts) {
        for (const t of ts.tasks || []) {
          for (const day of DAYS) {
            const mins = t.entries?.[day] || 0;
            totalMinutes += mins;
            if (mins > 0 && (t.billable?.[day] != null ? t.billable[day] : false)) {
              billableMinutes += mins;
            }
          }
        }
        for (const day of DAYS) {
          const s = ts.dayStatus?.[day]?.status;
          if (s === 'submitted' || s === 'approved') submittedDays++;
        }
      }
      result.timesheet = {
        weekStart,
        totalMinutes,
        targetMinutes: req.app.locals.weeklyTargetMinutes || 2400,
        submittedDays,
        billableMinutes,
      };
    } catch (_) { /* omit section */ }

    // --- tasks ---
    try {
      const agg = await Task.aggregate([
        { $match: { 'assignees.user': new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      const counts = { todo: 0, inProgress: 0, blocked: 0, done: 0 };
      for (const a of agg) {
        if (a._id === 'todo') counts.todo = a.count;
        else if (a._id === 'in_progress') counts.inProgress = a.count;
        else if (a._id === 'blocked') counts.blocked = a.count;
        else if (a._id === 'done') counts.done = a.count;
      }
      result.tasks = counts;
    } catch (_) { /* omit section */ }

    // --- team-only sections ---
    if (roles.some((r) => TEAM_ROLES.includes(r))) {
      // --- pending approvals ---
      try {
        const leaveFilter = { status: 'pending' };
        if (roles.includes('reporting_manager')) leaveFilter.assignedApprover = userId;
        else if (roles.includes('pm')) leaveFilter.assignedApprover = null;

        const [leaveCount, regCount, editCount, claimCount] = await Promise.all([
          Leave.countDocuments(leaveFilter),
          Attendance.countDocuments({ 'regularise.status': 'pending' }),
          EditRequest.countDocuments({ status: 'pending' }),
          ClaimRequest.countDocuments({ status: 'pending' }),
        ]);

        // Timesheet approvals: count timesheets with at least one submitted day
        let tsFilter = {};
        if (roles.includes('reporting_manager')) {
          const teamIds = await User.find({ reportingManagerId: userId }).select('_id');
          tsFilter.userId = { $in: teamIds.map((u) => u._id) };
        }
        const submittedSheets = await Timesheet.countDocuments({
          ...tsFilter,
          $or: DAYS.map((d) => ({ [`dayStatus.${d}.status`]: 'submitted' })),
        });

        result.pendingApprovals = {
          leave: leaveCount,
          timesheets: submittedSheets,
          regularise: regCount,
          editRequests: editCount,
          claimRequests: claimCount,
        };
      } catch (_) { /* omit section */ }

      // --- team summary ---
      try {
        const primaryTeamRole = roles.includes('admin')
          ? 'admin'
          : (roles.includes('reporting_manager') ? 'reporting_manager' : 'pm');
        const memberIds = await teamMemberIds(userId, primaryTeamRole);
        const today = todayStr();
        const presentToday = await Attendance.countDocuments({
          userId: { $in: memberIds },
          date: today,
          checkIn: { $ne: null },
        });
        const onLeaveToday = await Leave.countDocuments({
          userId: { $in: memberIds },
          status: 'approved',
          startDate: { $lte: today },
          endDate: { $gte: today },
        });

        // Avg utilization: billable / total logged across team for current week
        const weekStart = currentMonday();
        const teamSheets = await Timesheet.find({
          userId: { $in: memberIds },
          weekStart,
        });
        let totalLogged = 0;
        let totalBillable = 0;
        for (const ts of teamSheets) {
          for (const t of ts.tasks || []) {
            for (const day of DAYS) {
              const mins = t.entries?.[day] || 0;
              totalLogged += mins;
              if (mins > 0 && (t.billable?.[day] != null ? t.billable[day] : false)) {
                totalBillable += mins;
              }
            }
          }
        }
        const avgUtilization = totalLogged > 0 ? Math.round((totalBillable / totalLogged) * 100) : 0;

        result.teamSummary = {
          totalMembers: memberIds.length,
          presentToday,
          onLeaveToday,
          avgUtilization,
        };
      } catch (_) { /* omit section */ }
    }

    res.json(result);
  }));

  return router;
}
