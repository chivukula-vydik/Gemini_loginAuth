import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Leave, workingDays } from '../models/Leave.js';
import { Attendance } from '../models/Attendance.js';
import { Overtime } from '../models/Overtime.js';

export function createMyRequestsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(async (req, res) => {
    const userId = req.user.sub;

    const [leaves, regularisations, overtimes] = await Promise.all([
      Leave.find({ userId }).sort({ requestedAt: -1 }).lean(),
      Attendance.find({ userId, 'regularise.status': { $in: ['pending', 'approved', 'rejected'] } })
        .sort({ 'regularise.requestedAt': -1 }).lean(),
      Overtime.find({ userId }).sort({ requestedAt: -1 }).lean(),
    ]);

    const items = [];
    for (const l of leaves) {
      items.push({
        type: 'leave',
        _id: l._id,
        status: l.status,
        details: { leaveType: l.type, startDate: l.startDate, endDate: l.endDate, days: l.requestedDays || workingDays(l.startDate, l.endDate) },
        submittedAt: l.requestedAt,
        decidedAt: l.decidedAt,
      });
    }
    for (const r of regularisations) {
      if (!r.regularise) continue;
      items.push({
        type: 'regularisation',
        _id: r._id,
        status: r.regularise.status,
        details: { date: r.date, reason: r.regularise.reason },
        submittedAt: r.regularise.requestedAt,
        decidedAt: r.regularise.decidedAt,
      });
    }
    for (const o of overtimes) {
      items.push({
        type: 'overtime',
        _id: o._id,
        status: o.status,
        details: { date: o.date, startTime: o.startTime, endTime: o.endTime, minutes: o.minutes, reason: o.reason },
        submittedAt: o.requestedAt,
        decidedAt: o.decidedAt,
      });
    }

    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json(items);
  }));

  return router;
}
