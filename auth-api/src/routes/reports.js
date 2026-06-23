import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { User } from '../models/User.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function createReportsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/utilization', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    const timesheets = await Timesheet.find({
      weekStart: { $gte: startDate, $lte: endDate },
    }).populate('userId', 'displayName email');

    const byUser = new Map();
    for (const ts of timesheets) {
      if (!ts.userId) continue;
      const uid = String(ts.userId._id);
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          userId: uid,
          displayName: ts.userId.displayName,
          email: ts.userId.email,
          totalMinutes: 0,
          billableMinutes: 0,
        });
      }
      const entry = byUser.get(uid);
      for (const t of ts.tasks || []) {
        for (const d of DAYS) {
          const mins = t.entries?.[d] || 0;
          if (mins > 0) {
            entry.totalMinutes += mins;
            const isBillable = t.billable?.[d] != null ? t.billable[d] : false;
            if (isBillable) entry.billableMinutes += mins;
          }
        }
      }
    }

    const employees = [...byUser.values()].map((e) => ({
      ...e,
      nonBillableMinutes: e.totalMinutes - e.billableMinutes,
      utilizationPct: e.totalMinutes > 0 ? Math.round((e.billableMinutes / e.totalMinutes) * 100) : 0,
    }));

    const totals = employees.reduce(
      (acc, e) => ({
        totalMinutes: acc.totalMinutes + e.totalMinutes,
        billableMinutes: acc.billableMinutes + e.billableMinutes,
      }),
      { totalMinutes: 0, billableMinutes: 0 },
    );

    res.json({
      startDate, endDate,
      employees,
      summary: {
        ...totals,
        nonBillableMinutes: totals.totalMinutes - totals.billableMinutes,
        utilizationPct: totals.totalMinutes > 0 ? Math.round((totals.billableMinutes / totals.totalMinutes) * 100) : 0,
      },
    });
  }));

  return router;
}
