import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { PayGrade } from '../models/PayGrade.js';
import { PayGroup } from '../models/PayGroup.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { PayrollInput } from '../models/PayrollInput.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { StatutoryConfig } from '../models/StatutoryConfig.js';
import { Payslip } from '../models/Payslip.js';
import { Loan } from '../models/Loan.js';
import { Reimbursement } from '../models/Reimbursement.js';
import { InvestmentDeclaration } from '../models/InvestmentDeclaration.js';
import { Holiday } from '../models/Holiday.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Timesheet } from '../models/Timesheet.js';
import { User } from '../models/User.js';
import { StatutoryReport } from '../models/StatutoryReport.js';
import { computePayrollInput } from '../services/payrollBridge.js';
import { buildPayslip } from '../services/payrollEngine.js';

function getFY(month, year) {
  const fy = month <= 3 ? year - 1 : year;
  return `FY${fy}-${String(fy + 1).slice(2)}`;
}

export function createPayrollRouter() {
  const router = express.Router();

  // --- Pay Grades ---
  router.get('/grades', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const grades = await PayGrade.find().sort('code');
    res.json(grades);
  }));

  router.post('/grades', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { code, label, minCtc, maxCtc, defaultComponents } = req.body;
    const grade = await PayGrade.create({ code, label, minCtc, maxCtc, defaultComponents: defaultComponents || [] });
    res.status(201).json(grade);
  }));

  // --- Pay Groups ---
  router.get('/groups', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const groups = await PayGroup.find().populate('entity', 'name').populate('members', 'displayName email');
    res.json(groups);
  }));

  router.post('/groups', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { name, entity, cycle, ptState, members } = req.body;
    const group = await PayGroup.create({ name, entity: entity || null, cycle, ptState, members: members || [] });
    res.status(201).json(group);
  }));

  // --- Runs ---
  router.post('/runs', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const { month, year, payGroup, runType, scope, adhocMembers } = req.body;
    const run = await PayrollRun.create({
      period: { month, year },
      payGroup,
      runType: runType || 'regular',
      scope: scope || 'group',
      adhocMembers: adhocMembers || [],
    });
    res.status(201).json(run);
  }));

  router.get('/runs', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.year) filter['period.year'] = Number(req.query.year);
    if (req.query.month) filter['period.month'] = Number(req.query.month);
    const runs = await PayrollRun.find(filter).populate('payGroup', 'name').sort('-createdAt');
    res.json(runs);
  }));

  router.get('/runs/:id', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id).populate('payGroup', 'name');
    if (!run) return res.status(404).json({ error: 'run not found' });
    const inputs = await PayrollInput.find({ payrollRun: run._id }).populate('user', 'displayName email employeeCode');
    const payslips = await Payslip.find({ payrollRun: run._id }).populate('user', 'displayName email employeeCode');
    res.json({ run, inputs, payslips });
  }));

  router.post('/runs/:id/compute', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id).populate('payGroup');
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status === 'LOCKED' || run.status === 'PAID') {
      return res.status(400).json({ error: 'cannot compute a locked/paid run' });
    }

    const { month, year } = run.period;
    const members = run.scope === 'adhoc' ? run.adhocMembers : run.payGroup.members;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const holidays = await Holiday.find({ year, date: { $gte: startDate, $lte: endDate } });
    const config = await StatutoryConfig.findOne({ effectiveFrom: { $lte: startDate } }).sort('-effectiveFrom');
    if (!config) return res.status(400).json({ error: 'no statutory config found' });

    run.taxRulesetId = config._id;
    run.taxRulesetFY = config.fy;

    await PayrollInput.deleteMany({ payrollRun: run._id });
    await Payslip.deleteMany({ payrollRun: run._id });

    let totalGross = 0, totalDeductions = 0, totalNet = 0;

    for (const userId of members) {
      const attendances = await Attendance.find({ userId, date: { $gte: startDate, $lte: endDate } });
      const leaves = await Leave.find({ userId, status: 'approved', startDate: { $lte: endDate }, endDate: { $gte: startDate } });
      const timesheets = await Timesheet.find({ userId, weekStart: { $gte: startDate, $lte: endDate } });

      const bridgeData = computePayrollInput({ holidays, attendances, leaves, timesheets, month, year });

      const inputDoc = await PayrollInput.findOneAndUpdate(
        { payrollRun: run._id, user: userId },
        { ...bridgeData, period: { month, year }, computedAt: new Date() },
        { upsert: true, new: true },
      );

      const salary = await SalaryStructure.findOne({ user: userId, effectiveTo: null }).sort('-effectiveFrom');
      if (!salary) continue;

      const fy = getFY(month, year);
      const declaration = await InvestmentDeclaration.findOne({ user: userId, financialYear: fy });
      const regime = declaration?.regime || 'new';
      const declarations = declaration?.items || [];

      // YTD TDS: sum of TDS already deducted this FY for this employee
      const fyStart = month <= 3 ? { month: 4, year: year - 1 } : { month: 4, year };
      const priorSlips = await Payslip.find({
        user: userId,
        payrollRun: { $ne: run._id },
        $or: [
          { 'period.year': fyStart.year, 'period.month': { $gte: fyStart.month } },
          ...(fyStart.year < year ? [{ 'period.year': year, 'period.month': { $lte: month } }] : []),
        ],
      });
      const tdsPaidYTD = priorSlips.reduce((sum, s) => sum + (s.statutory?.tds || 0), 0);
      const fyEndMonth = month <= 3 ? 3 : 3;
      const fyEndYear = month <= 3 ? year : year + 1;
      const totalMonthsInFY = 12;
      const monthsElapsed = month <= 3
        ? (12 - 4 + 1) + month
        : month - 4 + 1;
      const monthsRemaining = totalMonthsInFY - monthsElapsed + 1;

      const loans = await Loan.find({ user: userId, status: 'active' });
      const loanEmis = [];
      for (const loan of loans) {
        const emi = loan.schedule?.find(s => s.period.month === month && s.period.year === year && s.status === 'due');
        if (emi) loanEmis.push({ amount: emi.amount, label: 'Loan EMI' });
      }

      const reimbursements = await Reimbursement.find({ user: userId, status: 'approved', payrollRun: null });

      const ptSlabs = config.pt?.find(p => p.state === (run.payGroup.ptState || ''))?.slabs || [];
      const slip = buildPayslip({
        components: salary.components,
        ctcAnnual: salary.ctcAnnual,
        input: bridgeData,
        statutoryConfig: { ...config.toObject(), pt: ptSlabs },
        regime,
        declarations,
        reimbursements,
        loanEmis,
        tdsPaidYTD,
        monthsRemaining,
      });

      await Payslip.findOneAndUpdate(
        { payrollRun: run._id, user: userId },
        { ...slip, period: { month, year } },
        { upsert: true, new: true },
      );

      totalGross += slip.gross;
      totalDeductions += slip.totalDeductions;
      totalNet += slip.netPay;
    }

    run.status = 'REVIEW';
    run.totals = { gross: totalGross, deductions: totalDeductions, netPay: totalNet, headcount: members.length };
    await run.save();

    res.json(run);
  }));

  router.post('/runs/:id/lock', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status !== 'REVIEW') return res.status(400).json({ error: 'can only lock a REVIEW run' });

    await PayrollInput.updateMany({ payrollRun: run._id }, { frozen: true });

    const reimbursements = await Payslip.find({ payrollRun: run._id });
    for (const slip of reimbursements) {
      if (slip.reimbursements?.length) {
        await Reimbursement.updateMany(
          { user: slip.user, status: 'approved', payrollRun: null },
          { payrollRun: run._id, status: 'paid' },
        );
      }
    }

    const payslips = await Payslip.find({ payrollRun: run._id });
    for (const slip of payslips) {
      const loans = await Loan.find({ user: slip.user, status: 'active' });
      for (const loan of loans) {
        const emi = loan.schedule?.find(s =>
          s.period.month === run.period.month && s.period.year === run.period.year && s.status === 'due'
        );
        if (emi) {
          emi.status = 'paid';
          await loan.save();
        }
      }
    }

    run.status = 'LOCKED';
    run.lockedAt = new Date();
    run.lockedBy = req.user.sub;
    await run.save();
    res.json(run);
  }));

  router.post('/runs/:id/reopen', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status !== 'LOCKED') return res.status(400).json({ error: 'can only reopen a LOCKED run' });

    await PayrollInput.updateMany({ payrollRun: run._id }, { frozen: false });
    run.status = 'DRAFT';
    run.lockedAt = null;
    run.lockedBy = null;
    await run.save();
    res.json(run);
  }));

  router.post('/runs/:id/disburse', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status !== 'LOCKED') return res.status(400).json({ error: 'can only disburse a LOCKED run' });
    run.status = 'PAID';
    await run.save();
    res.json(run);
  }));

  // --- Reports ---
  router.get('/reports/:type', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const { type } = req.params;
    const filter = { type };
    if (req.query.month) filter['period.month'] = Number(req.query.month);
    if (req.query.year) filter['period.year'] = Number(req.query.year);
    if (req.query.fy) filter['period.fy'] = req.query.fy;
    const reports = await StatutoryReport.find(filter).sort('-createdAt');
    res.json(reports);
  }));

  return router;
}
