import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { Loan, LOAN_TYPES } from '../models/Loan.js';

// ponytail: split into two routers — my-loans (employee) vs loan-management (admin/finance)
// so mount-level fg() doesn't block overrides for the other feature

export function createMyLoansRouter() {
  const router = express.Router();

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.user.sub }).sort('-createdAt');
    res.json(loans);
  }));

  return router;
}

export function createLoanManagementRouter() {
  const router = express.Router();

  router.post('/', requireAuth, requireFeature('loan-management', { write: true }), asyncHandler(async (req, res) => {
    const { user, principal, emiAmount, tenureMonths, startMonth, startYear, label, loanType } = req.body;
    if (!user || !principal || !emiAmount || !tenureMonths || !startMonth || !startYear) {
      return res.status(400).json({ error: 'user, principal, emiAmount, tenureMonths, startMonth, startYear required' });
    }
    if (loanType && !LOAN_TYPES.includes(loanType)) {
      return res.status(400).json({ error: `loanType must be one of: ${LOAN_TYPES.join(', ')}` });
    }
    const schedule = [];
    let m = startMonth, y = startYear;
    for (let i = 0; i < tenureMonths; i++) {
      schedule.push({ period: { month: m, year: y }, amount: emiAmount, status: 'due' });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    const loan = await Loan.create({ user, principal, emiAmount, tenureMonths, schedule, label: label || '', loanType: loanType || 'other' });
    res.status(201).json(loan);
  }));

  router.get('/user/:userId', requireAuth, asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.params.userId }).sort('-createdAt');
    res.json(loans);
  }));

  router.get('/all', requireAuth, asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const loans = await Loan.find(filter).populate('user', 'displayName email').sort('-createdAt');
    res.json(loans);
  }));

  router.post('/:id/pause', requireAuth, requireFeature('loan-management', { write: true }), asyncHandler(async (req, res) => {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'loan not found' });
    if (loan.status !== 'active') return res.status(400).json({ error: 'can only pause active loans' });
    loan.status = 'paused';
    await loan.save();
    res.json(loan);
  }));

  router.post('/:id/resume', requireAuth, requireFeature('loan-management', { write: true }), asyncHandler(async (req, res) => {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'loan not found' });
    if (loan.status !== 'paused') return res.status(400).json({ error: 'can only resume paused loans' });
    loan.status = 'active';
    await loan.save();
    res.json(loan);
  }));

  router.post('/:id/prepay', requireAuth, requireFeature('loan-management', { write: true }), asyncHandler(async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'positive amount required' });

    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'loan not found' });
    if (loan.status === 'closed') return res.status(400).json({ error: 'loan already closed' });

    let remaining = amount;
    for (const emi of loan.schedule) {
      if (emi.status === 'due' && remaining >= emi.amount) {
        emi.status = 'paid';
        remaining -= emi.amount;
      } else if (emi.status === 'due' && remaining > 0) {
        emi.amount -= remaining;
        remaining = 0;
        break;
      }
      if (remaining <= 0) break;
    }

    const allPaid = loan.schedule.every(e => e.status === 'paid');
    if (allPaid) loan.status = 'closed';

    await loan.save();
    res.json(loan);
  }));

  router.post('/:id/close', requireAuth, requireFeature('loan-management', { write: true }), asyncHandler(async (req, res) => {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'loan not found' });
    loan.status = 'closed';
    for (const emi of loan.schedule) {
      if (emi.status === 'due') emi.status = 'skipped';
    }
    await loan.save();
    res.json(loan);
  }));

  router.get('/:userId', requireAuth, asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.params.userId }).sort('-createdAt');
    res.json(loans);
  }));

  return router;
}
