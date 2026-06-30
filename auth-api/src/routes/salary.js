import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { User } from '../models/User.js';
import { PayGrade } from '../models/PayGrade.js';

export function createSalaryRouter() {
  const router = express.Router();

  router.get('/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const active = await SalaryStructure.findOne({ user: req.params.userId, effectiveTo: null }).sort('-effectiveFrom');
    if (!active) return res.json(null);
    res.json(active);
  }));

  router.post('/:userId', requireAuth, requireRole('admin'), requireFeature('payroll', { write: true }), asyncHandler(async (req, res) => {
    const { ctcAnnual, components, effectiveFrom } = req.body;
    if (!ctcAnnual || !components || !effectiveFrom) {
      return res.status(400).json({ error: 'ctcAnnual, components, and effectiveFrom required' });
    }

    const prev = await SalaryStructure.findOne({ user: req.params.userId, effectiveTo: null }).sort('-effectiveFrom');
    if (prev) {
      prev.effectiveTo = effectiveFrom;
      await prev.save();
    }

    const structure = await SalaryStructure.create({
      user: req.params.userId,
      ctcAnnual,
      components,
      effectiveFrom,
    });
    res.status(201).json(structure);
  }));

  router.get('/:userId/template', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId).select('payGrade');
    if (!user?.payGrade) return res.json({ components: [] });
    const grade = await PayGrade.findById(user.payGrade);
    if (!grade) return res.json({ components: [] });
    res.json({ components: grade.defaultComponents, minCtc: grade.minCtc, maxCtc: grade.maxCtc });
  }));

  return router;
}
