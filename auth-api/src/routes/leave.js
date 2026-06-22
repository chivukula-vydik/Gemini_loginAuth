import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Leave, LEAVE_TYPES, enumerateDays, workingDays } from '../models/Leave.js';
import { Attendance } from '../models/Attendance.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createLeaveRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // POST /leave — employee submits a leave request
  router.post('/', asyncHandler(async (req, res) => {
    const { type, startDate, endDate, reason } = req.body;
    if (!LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'invalid leave type' });
    if (!DATE_RE.test(startDate || '') || !DATE_RE.test(endDate || '')) {
      return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD' });
    }
    if (endDate < startDate) return res.status(400).json({ error: 'endDate is before startDate' });

    const doc = await Leave.create({
      userId: req.user.sub,
      type, startDate, endDate,
      reason: String(reason || ''),
    });
    res.status(201).json(doc);
  }));

  // GET /leave/mine — the caller's own requests, newest first
  router.get('/mine', asyncHandler(async (req, res) => {
    const docs = await Leave.find({ userId: req.user.sub }).sort({ requestedAt: -1 });
    res.json(docs.map((d) => ({ ...d.toObject(), days: workingDays(d.startDate, d.endDate) })));
  }));

  // GET /leave/pending — pm/admin review queue
  router.get('/pending', requireRole('admin', 'pm'), asyncHandler(async (req, res) => {
    const docs = await Leave.find({ status: 'pending' })
      .populate('userId', 'displayName email')
      .sort({ requestedAt: -1 });
    res.json(docs.map((d) => ({ ...d.toObject(), days: workingDays(d.startDate, d.endDate) })));
  }));

  // PATCH /leave/:id/decide — pm/admin approves or rejects
  router.patch('/:id/decide', requireRole('admin', 'pm'), asyncHandler(async (req, res) => {
    const { decision } = req.body;   // "approved" | "rejected"
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'invalid decision' });
    }

    const doc = await Leave.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.status !== 'pending') return res.status(409).json({ error: 'already decided' });

    doc.status = decision;
    doc.decidedBy = req.user.sub;
    doc.decidedAt = new Date();
    await doc.save();

    // On approval, mark each weekday in the range as leave in attendance so it
    // shows a LEAVE badge and is never treated as missed/absent. Weekends are
    // left alone (they're already "day off"). Days that already have a check-in
    // are not overwritten.
    if (decision === 'approved') {
      const days = enumerateDays(doc.startDate, doc.endDate)
        .filter((s) => { const dow = new Date(s + 'T00:00:00').getDay(); return dow !== 0 && dow !== 6; });
      for (const date of days) {
        const existing = await Attendance.findOne({ userId: doc.userId, date });
        if (existing) {
          // Don't clobber a day the person actually worked.
          if (!existing.checkIn) {
            existing.status = 'leave';
            existing.note = `${doc.type} leave`;
            await existing.save();
          }
        } else {
          await Attendance.create({ userId: doc.userId, date, status: 'leave', note: `${doc.type} leave` });
        }
      }
    }

    res.json(doc);
  }));

  return router;
}
