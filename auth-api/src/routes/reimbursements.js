import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Reimbursement } from '../models/Reimbursement.js';

export function createReimbursementsRouter() {
  const router = express.Router();

  router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { category, amount, claimDate, description } = req.body;
    if (!category || !amount || !claimDate) {
      return res.status(400).json({ error: 'category, amount, and claimDate required' });
    }
    const claim = await Reimbursement.create({ user: req.user.sub, category, amount, claimDate, description });
    res.status(201).json(claim);
  }));

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const claims = await Reimbursement.find({ user: req.user.sub }).sort('-createdAt');
    res.json(claims);
  }));

  router.get('/pending', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claims = await Reimbursement.find({ status: 'submitted' })
      .populate('user', 'displayName email employeeCode')
      .sort('-createdAt');
    res.json(claims);
  }));

  router.post('/:id/approve', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    claim.status = 'approved';
    claim.approver = req.user.sub;
    claim.approvedAt = new Date();
    await claim.save();
    res.json(claim);
  }));

  router.post('/:id/reject', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    if (!req.body.reason) return res.status(400).json({ error: 'rejection reason required' });
    claim.status = 'rejected';
    claim.approver = req.user.sub;
    claim.rejectionReason = req.body.reason;
    await claim.save();
    res.json(claim);
  }));

  return router;
}
