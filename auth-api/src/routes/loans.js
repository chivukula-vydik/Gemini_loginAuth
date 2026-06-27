import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Loan } from '../models/Loan.js';

export function createLoansRouter() {
  const router = express.Router();

  router.post('/', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const { user, principal, emiAmount, tenureMonths, startMonth, startYear } = req.body;
    if (!user || !principal || !emiAmount || !tenureMonths || !startMonth || !startYear) {
      return res.status(400).json({ error: 'user, principal, emiAmount, tenureMonths, startMonth, startYear required' });
    }
    const schedule = [];
    let m = startMonth, y = startYear;
    for (let i = 0; i < tenureMonths; i++) {
      schedule.push({ period: { month: m, year: y }, amount: emiAmount, status: 'due' });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    const loan = await Loan.create({ user, principal, emiAmount, tenureMonths, schedule });
    res.status(201).json(loan);
  }));

  router.get('/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.params.userId }).sort('-createdAt');
    res.json(loans);
  }));

  return router;
}
