import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Attendance, todayStr, SHIFT_START_HOUR, SHIFT_START_MINUTE } from '../models/Attendance.js';
import { Leave, workingDays } from '../models/Leave.js';
import { Timesheet } from '../models/Timesheet.js';
import { EditRequest } from '../models/EditRequest.js';
import { User } from '../models/User.js';
import { DAYS } from '../services/timesheetRows.js';

function greetingText() {
  const h = new Date().getHours();
  if (h >= 5 && h <= 11) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}

function mondayOfWeek(dateStr) {
  if (dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekDays(mondayStr) {
  const days = [];
  const d = new Date(mondayStr + 'T00:00:00');
  for (let i = 0; i < 5; i++) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function isLate(checkIn) {
  if (!checkIn) return false;
  const d = new Date(checkIn);
  return d.getHours() > SHIFT_START_HOUR || (d.getHours() === SHIFT_START_HOUR && d.getMinutes() > SHIFT_START_MINUTE);
}

export function createManagerRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('reporting_manager'));

  router.get('/dashboard', asyncHandler(async (req, res) => {
    const userId = req.user.sub;
    const today = todayStr();

    const teamMembers = await User.find({ reportingManagerId: userId, active: { $ne: false } })
      .select('_id displayName email');
    const teamIds = teamMembers.map((u) => u._id);

    // --- stats ---
    const todayAttendance = await Attendance.find({ userId: { $in: teamIds }, date: today });
    let present = 0, late = 0, wfh = 0, remoteClockIns = 0;
    for (const doc of todayAttendance) {
      if (!doc.checkIn) continue;
      present++;
      if (isLate(doc.checkIn)) late++;
      if (doc.punchType === 'wfh') wfh++;
      if (doc.punchType === 'remote') remoteClockIns++;
    }
    const onLeave = await Leave.countDocuments({
      userId: { $in: teamIds },
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today },
    });
    const stats = {
      total: teamMembers.length,
      present,
      late,
      onTime: present - late,
      wfh,
      remoteClockIns,
      onLeave,
      absent: teamMembers.length - present - onLeave,
    };

    // --- pending counts ---
    const [leaveCount, tsCount, regCount, editCount] = await Promise.all([
      Leave.countDocuments({ assignedApprover: userId, status: 'pending' }),
      Timesheet.countDocuments({ userId: { $in: teamIds }, status: 'submitted' }),
      Attendance.countDocuments({ userId: { $in: teamIds }, 'regularise.status': 'pending' }),
      EditRequest.countDocuments({ userId: { $in: teamIds }, status: 'pending' }),
    ]);
    const pendingCounts = { leave: leaveCount, timesheets: tsCount, regularise: regCount, editRequests: editCount };

    // --- pending leaves (full objects for inline approval) ---
    const pendingLeaves = await Leave.find({ assignedApprover: userId, status: 'pending' })
      .populate('userId', 'displayName email')
      .sort({ requestedAt: -1 });
    const pendingLeavesOut = pendingLeaves.map((l) => ({
      _id: l._id,
      user: l.userId,
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      days: l.requestedDays || workingDays(l.startDate, l.endDate),
      halfDay: l.halfDay,
      reason: l.reason,
      requestedAt: l.requestedAt,
    }));

    // --- calendar ---
    const weekStart = mondayOfWeek(req.query.week);
    const days = weekDays(weekStart);
    const weekEnd = days[days.length - 1];

    const weekAttendance = await Attendance.find({
      userId: { $in: teamIds },
      date: { $gte: weekStart, $lte: weekEnd },
    });
    const weekLeaves = await Leave.find({
      userId: { $in: teamIds },
      status: 'approved',
      startDate: { $lte: weekEnd },
      endDate: { $gte: weekStart },
    });

    const attMap = {};
    for (const a of weekAttendance) {
      const key = `${a.userId}_${a.date}`;
      attMap[key] = { status: a.status, punchType: a.punchType };
    }

    const members = teamMembers.map((m) => {
      const cells = {};
      for (const day of days) {
        const key = `${m._id}_${day}`;
        if (attMap[key]) {
          cells[day] = attMap[key];
        } else {
          const leave = weekLeaves.find((l) =>
            String(l.userId) === String(m._id) && l.startDate <= day && l.endDate >= day
          );
          if (leave) {
            cells[day] = { status: 'leave', leaveType: leave.type };
          } else {
            cells[day] = null;
          }
        }
      }
      return { _id: m._id, name: m.displayName || m.email, cells };
    });

    res.json({
      greeting: greetingText(),
      teamMembers: teamMembers.map((m) => ({ _id: m._id, displayName: m.displayName, email: m.email })),
      stats,
      pendingCounts,
      pendingLeaves: pendingLeavesOut,
      calendar: { weekStart, days, members },
    });
  }));

  router.get('/team', asyncHandler(async (req, res) => {
    const userId = req.user.sub;
    const today = todayStr();

    const members = await User.find({ reportingManagerId: userId, active: { $ne: false } })
      .select('displayName email employeeCode phone employmentType dateOfJoining departmentId designationId locationId')
      .populate('departmentId', 'name')
      .populate('designationId', 'title')
      .populate('locationId', 'name city');

    const memberIds = members.map((m) => m._id);

    const todayAttendance = await Attendance.find({ userId: { $in: memberIds }, date: today });
    const attMap = {};
    for (const a of todayAttendance) {
      attMap[String(a.userId)] = { status: a.status, punchType: a.punchType, checkIn: a.checkIn };
    }

    const activeLeaves = await Leave.find({
      userId: { $in: memberIds },
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today },
    });
    const leaveMap = {};
    for (const l of activeLeaves) leaveMap[String(l.userId)] = l.type;

    const result = members.map((m) => {
      const att = attMap[String(m._id)];
      const leave = leaveMap[String(m._id)];
      let todayStatus = 'absent';
      if (att?.checkIn) todayStatus = att.punchType === 'wfh' ? 'wfh' : 'present';
      else if (leave) todayStatus = `leave-${leave}`;
      return {
        _id: m._id,
        displayName: m.displayName,
        email: m.email,
        employeeCode: m.employeeCode,
        phone: m.phone,
        employmentType: m.employmentType,
        dateOfJoining: m.dateOfJoining,
        department: m.departmentId?.name,
        designation: m.designationId?.title,
        location: m.locationId?.name,
        locationCity: m.locationId?.city,
        todayStatus,
      };
    });

    res.json(result);
  }));

  return router;
}
