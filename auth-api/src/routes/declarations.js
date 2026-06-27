import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { InvestmentDeclaration } from '../models/InvestmentDeclaration.js';

export function createDeclarationsRouter() {
  const router = express.Router();

  router.get('/:fy/me', requireAuth, asyncHandler(async (req, res) => {
    const dec = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    res.json(dec || null);
  }));

  router.post('/:fy', requireAuth, asyncHandler(async (req, res) => {
    const { regime, items } = req.body;
    if (!regime || !items) return res.status(400).json({ error: 'regime and items required' });

    const existing = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    if (existing) {
      if (existing.lockedForTds) return res.status(400).json({ error: 'declaration locked for TDS' });
      existing.regime = regime;
      existing.items = items;
      await existing.save();
      return res.json(existing);
    }

    const dec = await InvestmentDeclaration.create({
      user: req.user.sub,
      financialYear: req.params.fy,
      regime,
      items,
    });
    res.status(201).json(dec);
  }));

  return router;
}
