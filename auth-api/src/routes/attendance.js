import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  Attendance, deriveStatus, calcMinutes, todayStr,
  SHIFT_START_HOUR, SHIFT_START_MINUTE,
} from '../models/Attendance.js';
import { User } from '../models/User.js';

export function createAttendanceRouter() {
  const router = express.Router();
  router.use(requireAuth);

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

    await doc.save();

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

    res.json(docs);
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

    let present = 0, partial = 0, absent = 0, wfh = 0, lateCount = 0, totalMinutes = 0;
    const workedDays = docs.filter(d => d.checkIn);

    for (const d of docs) {
      if (d.status === 'present') present++;
      else if (d.status === 'partial') partial++;
      else if (d.status === 'absent') absent++;
      else if (d.status === 'wfh' || d.status === 'wfh-partial') wfh++;

      totalMinutes += d.effectiveMinutes || 0;

      // Late = checkIn after shift start (9:30 AM)
      if (d.checkIn) {
        const ci = new Date(d.checkIn);
        if (ci.getHours() > SHIFT_START_HOUR ||
            (ci.getHours() === SHIFT_START_HOUR && ci.getMinutes() > SHIFT_START_MINUTE)) {
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

  // POST /attendance/regularise — employee submits a correction request
  router.post('/regularise', asyncHandler(async (req, res) => {
    const { date, reason, correctedCheckIn, correctedCheckOut } = req.body;
    if (!date || !reason) return res.status(400).json({ error: 'date and reason required' });

    let doc = await Attendance.findOne({ userId: req.user.sub, date });
    if (!doc) {
      // Create a stub doc for the day if none exists (missed punch entirely)
      doc = new Attendance({ userId: req.user.sub, date, status: 'absent' });
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
