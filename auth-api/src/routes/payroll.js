import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { PayGrade } from '../models/PayGrade.js';
import { PayGroup } from '../models/PayGroup.js';

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

  return router;
}
