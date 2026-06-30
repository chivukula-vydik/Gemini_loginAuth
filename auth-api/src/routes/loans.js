import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Loan, LOAN_TYPES } from '../models/Loan.js';

export function createLoansRouter() {
  const router = express.Router();

  // --- Admin/Finance: create loan ---
  router.post('/', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
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

  // --- Admin/Finance: list loans for a user ---
  router.get('/user/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.params.userId }).sort('-createdAt');
    res.json(loans);
  }));

  // --- Admin/Finance: list all active loans ---
  router.get('/all', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const loans = await Loan.find(filter).populate('user', 'displayName email').sort('-createdAt');
    res.json(loans);
  }));

  // --- Employee: my loans ---
  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.user.sub }).sort('-createdAt');
    res.json(loans);
  }));

  // --- Admin/Finance: pause loan ---
  router.post('/:id/pause', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'loan not found' });
    if (loan.status !== 'active') return res.status(400).json({ error: 'can only pause active loans' });
    loan.status = 'paused';
    await loan.save();
    res.json(loan);
  }));

  // --- Admin/Finance: resume loan ---
  router.post('/:id/resume', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'loan not found' });
    if (loan.status !== 'paused') return res.status(400).json({ error: 'can only resume paused loans' });
    loan.status = 'active';
    await loan.save();
    res.json(loan);
  }));

  // --- Admin/Finance: prepay (partial or full) ---
  router.post('/:id/prepay', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
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

  // --- Admin/Finance: manually close loan ---
  router.post('/:id/close', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'loan not found' });
    loan.status = 'closed';
    for (const emi of loan.schedule) {
      if (emi.status === 'due') emi.status = 'skipped';
    }
    await loan.save();
    res.json(loan);
  }));

  // Backward-compat: old route pattern
  router.get('/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.params.userId }).sort('-createdAt');
    res.json(loans);
  }));

  return router;
}
