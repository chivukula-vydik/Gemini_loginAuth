import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Payslip } from '../models/Payslip.js';

export function createPayslipsRouter() {
  const router = express.Router();

  router.get('/me', requireAuth, requireFeature('my-payslips'), asyncHandler(async (req, res) => {
    const slips = await Payslip.find({ user: req.user.sub })
      .sort({ 'period.year': -1, 'period.month': -1 })
      .select('period gross totalDeductions netPay lopDays paidDays');
    res.json(slips);
  }));

  router.get('/me/:year/:month', requireAuth, requireFeature('my-payslips'), asyncHandler(async (req, res) => {
    const slip = await Payslip.findOne({
      user: req.user.sub,
      'period.year': Number(req.params.year),
      'period.month': Number(req.params.month),
    });
    if (!slip) return res.status(404).json({ error: 'payslip not found' });
    res.json(slip);
  }));

  router.get('/:runId', requireAuth, requireFeature('payroll'), asyncHandler(async (req, res) => {
    const slips = await Payslip.find({ payrollRun: req.params.runId })
      .populate('user', 'displayName email employeeCode');
    res.json(slips);
  }));

  router.get('/:runId/:userId', requireAuth, requireFeature('payroll'), asyncHandler(async (req, res) => {
    const slip = await Payslip.findOne({ payrollRun: req.params.runId, user: req.params.userId });
    if (!slip) return res.status(404).json({ error: 'payslip not found' });
    res.json(slip);
  }));

  return router;
}
