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

    const docs = await Attendance.find({
      userId: req.user.sub,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    const covered = new Set(docs.map((d) => d.date));
    const holidays = await Holiday.find({ date: { $gte: startDate, $lte: endDate } });
    const synthetic = holidays
      .filter((h) => !covered.has(h.date))
      .map((h) => holidayPlaceholder(req.user.sub, h));

    const merged = [...docs.map((d) => d.toObject()), ...synthetic].sort((a, b) => a.date.localeCompare(b.date));
    res.json(merged);
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

    let present = 0, partial = 0, absent = 0, wfh = 0, lateCount = 0, totalMinutes = 0;
    const workedDays = docs.filter(d => d.checkIn);

    for (const d of docs) {
      if (d.status === 'present') present++;
      else if (d.status === 'partial') partial++;
      else if (d.status === 'absent' && !holidayDates.has(d.date)) absent++;
      else if (d.status === 'wfh' || d.status === 'wfh-partial') wfh++;

      totalMinutes += d.effectiveMinutes || 0;

      // Late = checkIn after shift start (9:30 AM)
      if (d.checkIn) {
        const ci = new Date(d.checkIn);
        if (ci.getHours() > shift.startHour ||
            (ci.getHours() === shift.startHour && ci.getMinutes() > shift.startMinute)) {
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
  router.get('/team', requireRole('admin', 'pm'), asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = Number(year);
    const m = String(month).padStart(2, '0');
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;

    let memberIds;
    if (req.user.role === 'admin') {
      memberIds = (await User.find({ _id: { $ne: req.user.sub } }).select('_id')).map((u) => u._id);
    } else {
      const projects = await Project.find({ ownerPm: req.user.sub }).select('members');
      const set = new Set();
      for (const p of projects) for (const member of p.members) set.add(String(member));
      memberIds = Array.from(set);
    }

    const users = await User.find({ _id: { $in: memberIds } }).select('displayName email').sort('displayName');
    const docs = await Attendance.find({
      userId: { $in: memberIds },
      date: { $gte: startDate, $lte: endDate },
    });

    const byUser = new Map();
    for (const id of memberIds) byUser.set(String(id), []);
    for (const d of docs) {
      const key = String(d.userId);
      if (byUser.has(key)) byUser.get(key).push(d);
    }

    const team = users.map((u) => {
      const userDocs = byUser.get(String(u._id)) || [];
      const worked = userDocs.filter((d) => d.checkIn);
      const presentCount = userDocs.filter((d) => d.status === 'present' || d.status === 'wfh').length;
      const lateCount = worked.filter((d) => {
        const ci = new Date(d.checkIn);
        return ci.getHours() > shift.startHour ||
          (ci.getHours() === shift.startHour && ci.getMinutes() > shift.startMinute);
      }).length;
      const totalMinutes = worked.reduce((s, d) => s + (d.effectiveMinutes || 0), 0);
      const avgMinutesPerDay = worked.length ? Math.round(totalMinutes / worked.length) : 0;
      return {
        userId: u._id, displayName: u.displayName, email: u.email,
        presentCount, lateCount, avgMinutesPerDay,
        onTimePct: worked.length ? Math.round(((worked.length - lateCount) / worked.length) * 100) : 0,
      };
    });

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

  // GET /attendance/regularise/pending — admin/pm only
  router.get('/regularise/pending', requireRole('admin', 'pm'), asyncHandler(async (req, res) => {
    const docs = await Attendance.find({ 'regularise.status': 'pending' })
      .populate('userId', 'displayName email')
      .sort({ 'regularise.requestedAt': -1 });

    res.json(docs);
  }));

  // PATCH /attendance/regularise/:id/decide — admin/pm approves or rejects
  router.patch('/regularise/:id/decide', requireRole('admin', 'pm'), asyncHandler(async (req, res) => {
    const { decision } = req.body;   // "approved" | "rejected"
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'invalid decision' });
    }

    const doc = await Attendance.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
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

  return router;
}
