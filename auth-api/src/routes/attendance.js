import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  Attendance, deriveStatus, calcMinutes, todayStr,
  SHIFT_START_HOUR, SHIFT_START_MINUTE,
} from '../models/Attendance.js';
// Default shift falls back to the model's constants when no config is
// supplied (e.g. older callers/tests that don't pass one).
const DEFAULT_SHIFT = {
  startHour: SHIFT_START_HOUR, startMinute: SHIFT_START_MINUTE,
  endHour: 18, endMinute: 30, durationMinutes: 540,
};
import { User } from '../models/User.js';
import { Holiday } from '../models/Holiday.js';
import { Project } from '../models/Project.js';
import { Overtime } from '../models/Overtime.js';
import { Shift } from '../models/Shift.js';

// Synthetic, unsaved "holiday" entries for dates in range that have no real
// attendance doc — lets the calendar render a HOLIDAY badge without ever
// writing a row for a day nobody punched.
function holidayPlaceholder(userId, holiday) {
  return {
    _id: `holiday-${holiday.date}`,
    userId,
    date: holiday.date,
    checkIn: null,
    checkOut: null,
    totalMinutes: 0,
    breakMinutes: 0,
    effectiveMinutes: 0,
    status: 'holiday',
    punchType: 'office',
    breaks: [],
    note: holiday.name,
    regularise: { status: 'none', reason: '', correctedCheckIn: null, correctedCheckOut: null, requestedAt: null, decidedBy: null, decidedAt: null },
  };
}

// Shared by /month and /range: real docs for [startDate, endDate] (inclusive,
// "YYYY-MM-DD" string compare) merged with synthetic holiday placeholders for
// any date in range that has no real doc.
async function fetchRange(userId, startDate, endDate) {
  const docs = await Attendance.find({
    userId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });

  const covered = new Set(docs.map((d) => d.date));
  const holidays = await Holiday.find({ date: { $gte: startDate, $lte: endDate } });
  const synthetic = holidays
    .filter((h) => !covered.has(h.date))
    .map((h) => holidayPlaceholder(userId, h));

  return [...docs.map((d) => d.toObject()), ...synthetic].sort((a, b) => a.date.localeCompare(b.date));
}

async function shiftForUser(userDoc, fallbackShift) {
  if (userDoc?.shiftId) {
    const s = await Shift.findById(userDoc.shiftId).lean();
    if (s) return { startHour: s.startHour, startMinute: s.startMinute,
                    endHour: s.endHour, endMinute: s.endMinute,
                    durationMinutes: s.durationMinutes || 540 };
  }
  return fallbackShift;
}

export function createAttendanceRouter(shiftConfig) {
  const router = express.Router();
  const shift = { ...DEFAULT_SHIFT, ...(shiftConfig || {}) };
  router.use(requireAuth);

  // GET /attendance/config — shift timings, sourced from auth.config.json
  router.get('/config', asyncHandler(async (req, res) => {
    res.json(shift);
  }));

  // GET /attendance/state — activation boundary + whether any clock-in exists.
  // Drives the first-run/empty experience on the frontend.
  router.get('/state', asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub).select('attendanceActivatedDate');
    const hasClockIn = await Attendance.exists({ userId: req.user.sub, checkIn: { $ne: null } });
    res.json({
      activatedDate: user?.attendanceActivatedDate || null,
      hasClockIn: Boolean(hasClockIn),
    });
  }));

  // GET /attendance/today — current day's doc for the logged-in user
  router.get('/today', asyncHandler(async (req, res) => {
    const date = todayStr();
    const doc = await Attendance.findOne({ userId: req.user.sub, date });
    if (!doc) {
      return res.json({ checkIn: null, checkOut: null, status: 'absent', breaks: [], breakMinutes: 0 });
    }
    res.json(doc);
  }));

  // POST /attendance/checkin
  router.post('/checkin', asyncHandler(async (req, res) => {
    const { punchType } = req.body;                         // "office" | "remote" | "wfh"
    if (!['office', 'remote', 'wfh'].includes(punchType)) {
      return res.status(400).json({ error: 'invalid punchType' });
    }

    const date = todayStr();
    let doc = await Attendance.findOne({ userId: req.user.sub, date });

    if (doc) {
      // Already checked in and not checked out → 409
      if (doc.checkIn && !doc.checkOut) {
        return res.status(409).json({ error: 'already checked in' });
      }
      // Both set → allow re-punch (forgot to check out yesterday scenario)
      doc.checkIn = new Date();
      doc.checkOut = null;
      doc.totalMinutes = 0;
      doc.effectiveMinutes = 0;
      doc.breakMinutes = 0;
      doc.breaks = [];
      doc.punchType = punchType;
      doc.status = punchType === 'wfh' ? 'wfh-partial' : 'partial';
    } else {
      doc = new Attendance({
        userId: req.user.sub,
        date,
        checkIn: new Date(),
        punchType,
        status: punchType === 'wfh' ? 'wfh-partial' : 'partial',
      });
    }

    try {
      await doc.save();
    } catch (err) {
      // Concurrent double-tap: another request won the race and inserted the
      // (userId, date) doc first. Treat it the same as "already checked in"
      // rather than surfacing a 500.
      if (err.code === 11000) {
        return res.status(409).json({ error: 'already checked in' });
      }
      throw err;
    }

    // Stamp the activation day on the very first clock-in so prior days are
    // never treated as missed.
    await User.updateOne(
      { _id: req.user.sub, attendanceActivatedDate: null },
      { $set: { attendanceActivatedDate: date } },
    );

    res.json(doc);
  }));

  // POST /attendance/checkout
  router.post('/checkout', asyncHandler(async (req, res) => {
    const date = todayStr();
    const doc = await Attendance.findOne({ userId: req.user.sub, date });

    if (!doc || !doc.checkIn) return res.status(409).json({ error: 'not checked in' });
    if (doc.checkOut) return res.status(409).json({ error: 'already checked out' });

    // Auto-end any open break
    const openBreak = doc.breaks.find(b => !b.end);
    if (openBreak) {
      openBreak.end = new Date();
      doc.breakMinutes += Math.round((openBreak.end - openBreak.start) / 60000);
    }

    doc.checkOut = new Date();
    const mins = calcMinutes(doc);
    doc.totalMinutes = mins.totalMinutes;
    doc.effectiveMinutes = mins.effectiveMinutes;
    doc.status = deriveStatus(doc);

    await doc.save();
    res.json(doc);
  }));

  // POST /attendance/break/start
  router.post('/break/start', asyncHandler(async (req, res) => {
    const date = todayStr();
    const doc = await Attendance.findOne({ userId: req.user.sub, date });

    if (!doc || !doc.checkIn) return res.status(409).json({ error: 'not checked in' });
    if (doc.checkOut) return res.status(409).json({ error: 'already checked out' });

    const openBreak = doc.breaks.find(b => !b.end);
    if (openBreak) return res.status(409).json({ error: 'break already in progress' });

    doc.breaks.push({ start: new Date(), end: null });
    await doc.save();
    res.json(doc);
  }));

  // POST /attendance/break/end
  router.post('/break/end', asyncHandler(async (req, res) => {
    const date = todayStr();
    const doc = await Attendance.findOne({ userId: req.user.sub, date });

    if (!doc) return res.status(409).json({ error: 'no attendance record' });

    const openBreak = doc.breaks.find(b => !b.end);
    if (!openBreak) return res.status(409).json({ error: 'no open break' });

    openBreak.end = new Date();
    doc.breakMinutes += Math.round((openBreak.end - openBreak.start) / 60000);
    await doc.save();
    res.json(doc);
  }));

  // GET /attendance/month?year=2026&month=6
  router.get('/month', asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = Number(year);
    const m = String(month).padStart(2, '0');
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;       // inclusive range, Mongo string compare handles it

    const merged = await fetchRange(req.user.sub, startDate, endDate);
    res.json(merged);
  }));

  // GET /attendance/range?start=2026-06-22&end=2026-06-26 — arbitrary date
  // span, e.g. a Mon-Fri timesheet week (which can cross a month boundary,
  // unlike /month).
  router.get('/range', asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });

    const merged = await fetchRange(req.user.sub, start, end);
    const today = todayStr();
    const now = new Date();

    const withLiveData = merged.map((doc) => {
      if (!doc.checkIn || doc.checkOut) return doc;

      if (doc.date === today) {
        // Still clocked in today: compute elapsed time live, mirroring the
        // same formula AttendancePage already uses client-side for its own
        // ticking display (gross time minus any closed or still-open break).
        const openBreak = (doc.breaks || []).find((b) => !b.end);
        const openBreakElapsed = openBreak ? (now - new Date(openBreak.start)) / 60000 : 0;
        const liveBreakMinutes = (doc.breakMinutes || 0) + openBreakElapsed;
        const liveGrossMinutes = (now - new Date(doc.checkIn)) / 60000;
        return { ...doc, effectiveMinutes: Math.round(Math.max(0, liveGrossMinutes - liveBreakMinutes)) };
      }

      if (doc.date < today) {
        // A past day stuck mid-session: the employee forgot to check out.
        // Never invent an hours value — flag it so the timesheet can point
        // back at the existing regularise flow instead.
        return { ...doc, needsRegularise: true };
      }

      return doc;
    });

    res.json(withLiveData);
  }));

  // GET /attendance/stats?year=2026&month=6
  router.get('/stats', asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = Number(year);
    const m = String(month).padStart(2, '0');
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;

    const docs = await Attendance.find({
      userId: req.user.sub,
      date: { $gte: startDate, $lte: endDate },
    });

    const holidayDates = new Set(
      (await Holiday.find({ date: { $gte: startDate, $lte: endDate } })).map((h) => h.date),
    );

    const userDoc = await User.findById(req.user.sub).select('shiftId').lean();
    const userShift = await shiftForUser(userDoc, shift);

    let present = 0, partial = 0, absent = 0, wfh = 0, lateCount = 0, totalMinutes = 0;
    const workedDays = docs.filter(d => d.checkIn);

    for (const d of docs) {
      if (d.status === 'present') present++;
      else if (d.status === 'partial') partial++;
      else if (d.status === 'absent' && !holidayDates.has(d.date)) absent++;
      else if (d.status === 'wfh' || d.status === 'wfh-partial') wfh++;

      totalMinutes += d.effectiveMinutes || 0;

      if (d.checkIn) {
        const ci = new Date(d.checkIn);
        if (ci.getHours() > userShift.startHour ||
            (ci.getHours() === userShift.startHour && ci.getMinutes() > userShift.startMinute)) {
          lateCount++;
        }
      }
    }

    const avgMinutesPerDay = workedDays.length ? Math.round(totalMinutes / workedDays.length) : 0;
    const onTimePct = workedDays.length
      ? Math.round(((workedDays.length - lateCount) / workedDays.length) * 100)
      : 0;

    res.json({ present, partial, absent, wfh, lateCount, totalMinutes, avgMinutesPerDay, onTimePct });
  }));

  // GET /attendance/team?year=2026&month=6 — per-member summary for a PM's
  // direct reports (project members across projects they own) or, for an
  // admin, every user.
  router.get('/team', requireRole('admin', 'pm', 'reporting_manager'), asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = Number(year);
    const m = String(month).padStart(2, '0');
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;

    const roles = req.user.roles || [req.user.role || 'employee'];
    let memberIds;
    if (roles.includes('admin')) {
      memberIds = (await User.find({ _id: { $ne: req.user.sub } }).select('_id')).map((u) => u._id);
    } else if (roles.includes('reporting_manager')) {
      const teamUsers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      memberIds = teamUsers.map((u) => u._id);
    } else {
      const projects = await Project.find({ ownerPm: req.user.sub }).select('members');
      const set = new Set();
      for (const p of projects) for (const member of p.members) set.add(String(member));
      memberIds = Array.from(set);
    }

    const users = await User.find({ _id: { $in: memberIds } }).select('displayName email shiftId').sort('displayName');
    const docs = await Attendance.find({
      userId: { $in: memberIds },
      date: { $gte: startDate, $lte: endDate },
    });

    const shiftCache = new Map();
    async function getShiftCached(shiftId) {
      if (!shiftId) return shift;
      const key = String(shiftId);
      if (shiftCache.has(key)) return shiftCache.get(key);
      const s = await Shift.findById(shiftId).lean();
      const result = s ? { startHour: s.startHour, startMinute: s.startMinute } : shift;
      shiftCache.set(key, result);
      return result;
    }

    const byUser = new Map();
    for (const id of memberIds) byUser.set(String(id), []);
    for (const d of docs) {
      const key = String(d.userId);
      if (byUser.has(key)) byUser.get(key).push(d);
    }

    const team = [];
    for (const u of users) {
      const userShift = await getShiftCached(u.shiftId);
      const userDocs = byUser.get(String(u._id)) || [];
      const worked = userDocs.filter((d) => d.checkIn);
      const presentCount = userDocs.filter((d) => d.status === 'present' || d.status === 'wfh').length;
      const lateCount = worked.filter((d) => {
        const ci = new Date(d.checkIn);
        return ci.getHours() > userShift.startHour ||
          (ci.getHours() === userShift.startHour && ci.getMinutes() > userShift.startMinute);
      }).length;
      const totalMinutes = worked.reduce((s, d) => s + (d.effectiveMinutes || 0), 0);
      const avgMinutesPerDay = worked.length ? Math.round(totalMinutes / worked.length) : 0;
      team.push({
        userId: u._id, displayName: u.displayName, email: u.email,
        presentCount, lateCount, avgMinutesPerDay,
        onTimePct: worked.length ? Math.round(((worked.length - lateCount) / worked.length) * 100) : 0,
      });
    }

    res.json(team);
  }));

  // POST /attendance/regularise — employee submits a correction request
  router.post('/regularise', asyncHandler(async (req, res) => {
    const { date, reason, correctedCheckIn, correctedCheckOut } = req.body;
    if (!date || !reason) return res.status(400).json({ error: 'date and reason required' });

    let doc = await Attendance.findOne({ userId: req.user.sub, date });
    if (!doc) {
      // Create a stub doc for the day if none exists (missed punch entirely)
      doc = new Attendance({ userId: req.user.sub, date, status: 'absent' });
    }

    if (doc.regularise.status === 'pending') {
      return res.status(409).json({ error: 'a regularise request is already pending for this day' });
    }

    doc.regularise = {
      status: 'pending',
      reason,
      correctedCheckIn: correctedCheckIn || null,
      correctedCheckOut: correctedCheckOut || null,
      requestedAt: new Date(),
      decidedBy: null,
      decidedAt: null,
    };

    await doc.save();
    res.json(doc);
  }));

  // GET /attendance/team/today — live daily stats for the manager's team
  router.get('/team/today', requireRole('admin', 'pm', 'reporting_manager'), asyncHandler(async (req, res) => {
    const today = todayStr();
    const roles = req.user.roles || [req.user.role || 'employee'];
    let memberIds;
    if (roles.includes('admin')) {
      memberIds = (await User.find({ _id: { $ne: req.user.sub } }).select('_id')).map((u) => u._id);
    } else if (roles.includes('reporting_manager')) {
      memberIds = (await User.find({ reportingManagerId: req.user.sub }).select('_id')).map((u) => u._id);
    } else {
      const projects = await Project.find({ ownerPm: req.user.sub }).select('members');
      const set = new Set();
      for (const p of projects) for (const member of p.members) set.add(String(member));
      memberIds = Array.from(set);
    }

    const total = memberIds.length;
    const docs = await Attendance.find({ userId: { $in: memberIds }, date: today });

    let present = 0, late = 0, wfh = 0, remoteClockIns = 0;
    const members = [];
    const checkedIn = new Set();

    for (const d of docs) {
      checkedIn.add(String(d.userId));
      if (!d.checkIn) continue;
      present++;
      const ci = new Date(d.checkIn);
      if (ci.getHours() > shift.startHour || (ci.getHours() === shift.startHour && ci.getMinutes() > shift.startMinute)) late++;
      if (d.punchType === 'wfh') wfh++;
      if (d.punchType === 'remote') remoteClockIns++;
      members.push({ userId: String(d.userId), status: d.status, punchType: d.punchType, checkIn: d.checkIn, checkOut: d.checkOut, lateMinutes: ci.getHours() > shift.startHour || (ci.getHours() === shift.startHour && ci.getMinutes() > shift.startMinute) ? (ci.getHours() - shift.startHour) * 60 + (ci.getMinutes() - shift.startMinute) : 0 });
    }

    // Approved leave today
    const Leave = (await import('../models/Leave.js')).Leave;
    const onLeave = await Leave.countDocuments({
      userId: { $in: memberIds },
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    res.json({
      total,
      present,
      late,
      onTime: present - late,
      wfh,
      remoteClockIns,
      onLeave,
      absent: total - present - onLeave,
      members,
    });
  }));

  // GET /attendance/team/calendar?year=2026&month=6 — per-day-per-member attendance
  router.get('/team/calendar', requireRole('admin', 'pm', 'reporting_manager'), asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = Number(year);
    const m = String(month).padStart(2, '0');
    const startDate = `${y}-${m}-01`;
    const lastDay = new Date(y, Number(m), 0).getDate();
    const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

    const roles = req.user.roles || [req.user.role || 'employee'];
    let memberIds;
    if (roles.includes('admin')) {
      memberIds = (await User.find({ _id: { $ne: req.user.sub } }).select('_id')).map((u) => u._id);
    } else if (roles.includes('reporting_manager')) {
      memberIds = (await User.find({ reportingManagerId: req.user.sub }).select('_id')).map((u) => u._id);
    } else {
      const projects = await Project.find({ ownerPm: req.user.sub }).select('members');
      const set = new Set();
      for (const p of projects) for (const member of p.members) set.add(String(member));
      memberIds = Array.from(set);
    }

    const users = await User.find({ _id: { $in: memberIds } }).select('displayName email departmentId').populate('departmentId', 'name').sort('displayName');
    const docs = await Attendance.find({ userId: { $in: memberIds }, date: { $gte: startDate, $lte: endDate } });

    const Leave = (await import('../models/Leave.js')).Leave;
    const leaves = await Leave.find({
      userId: { $in: memberIds },
      status: 'approved',
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    const holidays = await Holiday.find({ date: { $gte: startDate, $lte: endDate } });
    const holidaySet = new Set(holidays.map((h) => h.date));

    const attMap = {};
    for (const d of docs) {
      const key = `${d.userId}_${d.date}`;
      attMap[key] = { status: d.status, punchType: d.punchType, checkIn: d.checkIn, checkOut: d.checkOut, totalMinutes: d.totalMinutes, effectiveMinutes: d.effectiveMinutes, lateMinutes: 0 };
      if (d.checkIn) {
        const ci = new Date(d.checkIn);
        if (ci.getHours() > shift.startHour || (ci.getHours() === shift.startHour && ci.getMinutes() > shift.startMinute)) {
          attMap[key].lateMinutes = (ci.getHours() - shift.startHour) * 60 + (ci.getMinutes() - shift.startMinute);
        }
      }
    }

    const allDates = [];
    for (let d = 1; d <= lastDay; d++) allDates.push(`${y}-${m}-${String(d).padStart(2, '0')}`);

    const members = users.map((u) => {
      const cells = {};
      for (const date of allDates) {
        const key = `${u._id}_${date}`;
        const day = new Date(date + 'T00:00:00').getDay();
        if (day === 0 || day === 6) {
          cells[date] = { status: 'weekend' };
        } else if (holidaySet.has(date)) {
          cells[date] = { status: 'holiday' };
        } else if (attMap[key]) {
          cells[date] = attMap[key];
        } else {
          const leave = leaves.find((l) => String(l.userId) === String(u._id) && l.startDate <= date && l.endDate >= date);
          if (leave) {
            cells[date] = { status: 'leave', leaveType: leave.type };
          } else {
            cells[date] = { status: date < todayStr() ? 'absent' : null };
          }
        }
      }
      return {
        _id: u._id,
        displayName: u.displayName,
        email: u.email,
        department: u.departmentId?.name || null,
        cells,
      };
    });

    res.json({ year: y, month: Number(m), days: allDates, members });
  }));

  // GET /attendance/regularise/pending — reporting line approval
  router.get('/regularise/pending', requireRole('admin', 'reporting_manager', 'team_lead'), asyncHandler(async (req, res) => {
    const filter = { 'regularise.status': 'pending' };
    const roles = req.user.roles || [req.user.role];
    if (roles.includes('reporting_manager') || roles.includes('team_lead')) {
      const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamMembers.map((u) => u._id) };
    }
    const docs = await Attendance.find(filter)
      .populate('userId', 'displayName email')
      .sort({ 'regularise.requestedAt': -1 });

    res.json(docs);
  }));

  // PATCH /attendance/regularise/:id/decide — reporting line approval
  router.patch('/regularise/:id/decide', requireRole('admin', 'reporting_manager', 'team_lead'), asyncHandler(async (req, res) => {
    const { decision } = req.body;   // "approved" | "rejected"
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'invalid decision' });
    }

    const doc = await Attendance.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    const roles = req.user.roles || [req.user.role];
    if (roles.includes('reporting_manager') || roles.includes('team_lead')) {
      const member = await User.findById(doc.userId);
      if (!member || String(member.reportingManagerId) !== req.user.sub) {
        return res.status(404).json({ error: 'not found' });
      }
    }
    if (doc.regularise.status !== 'pending') return res.status(409).json({ error: 'already decided' });

    doc.regularise.status = decision;
    doc.regularise.decidedBy = req.user.sub;
    doc.regularise.decidedAt = new Date();

    if (decision === 'approved') {
      // Apply corrected times
      const dateBase = doc.date;   // "2026-06-20"

      if (doc.regularise.correctedCheckIn) {
        const [h, m] = doc.regularise.correctedCheckIn.split(':').map(Number);
        const ci = new Date(dateBase + 'T00:00:00');
        ci.setHours(h, m, 0, 0);
        doc.checkIn = ci;
      }
      if (doc.regularise.correctedCheckOut) {
        const [h, m] = doc.regularise.correctedCheckOut.split(':').map(Number);
        const co = new Date(dateBase + 'T00:00:00');
        co.setHours(h, m, 0, 0);
        doc.checkOut = co;
      }

      // Recalculate
      const mins = calcMinutes(doc);
      doc.totalMinutes = mins.totalMinutes;
      doc.effectiveMinutes = mins.effectiveMinutes;
      doc.status = deriveStatus(doc);
    }

    await doc.save();
    res.json(doc);
  }));

  // ─── Overtime ───

  // POST /attendance/overtime — employee submits overtime request
  router.post('/overtime', asyncHandler(async (req, res) => {
    const { date, startTime, endTime, reason, note } = req.body;
    if (!date || !startTime || !endTime) return res.status(400).json({ error: 'date, startTime and endTime required' });

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes <= 0) return res.status(400).json({ error: 'endTime must be after startTime' });

    const existing = await Overtime.findOne({ userId: req.user.sub, date, status: 'pending' });
    if (existing) return res.status(409).json({ error: 'overtime request already pending for this date' });

    const doc = await Overtime.create({
      userId: req.user.sub,
      date, startTime, endTime, minutes,
      reason: reason || 'other',
      note: note || '',
    });
    res.status(201).json(doc);
  }));

  // GET /attendance/overtime/mine — employee's own overtime requests
  router.get('/overtime/mine', asyncHandler(async (req, res) => {
    const docs = await Overtime.find({ userId: req.user.sub }).sort({ requestedAt: -1 });
    res.json(docs);
  }));

  // GET /attendance/overtime/pending — RM sees pending overtime from direct reports
  router.get('/overtime/pending', requireRole('admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const roles = req.user.roles || [req.user.role || 'employee'];
    let filter = { status: 'pending' };
    if (roles.includes('reporting_manager') && !roles.includes('admin')) {
      const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamMembers.map((u) => u._id) };
    }
    const docs = await Overtime.find(filter)
      .populate('userId', 'displayName email')
      .sort({ requestedAt: -1 });
    res.json(docs);
  }));

  // PATCH /attendance/overtime/:id/decide — RM approves or rejects
  router.patch('/overtime/:id/decide', requireRole('admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const { decision } = req.body;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });

    const doc = await Overtime.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.status !== 'pending') return res.status(409).json({ error: 'already decided' });

    const roles = req.user.roles || [req.user.role || 'employee'];
    if (roles.includes('reporting_manager') && !roles.includes('admin')) {
      const member = await User.findById(doc.userId);
      if (!member || String(member.reportingManagerId) !== req.user.sub) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    doc.status = decision;
    doc.decidedBy = req.user.sub;
    doc.decidedAt = new Date();
    await doc.save();
    res.json(doc);
  }));

  return router;
}
