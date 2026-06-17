import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { EditRequest } from '../models/EditRequest.js';

export function createEditRequestsRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('pm', 'admin'));

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status || 'pending';
    const reqs = await EditRequest.find({ status })
      .populate('userId', 'displayName email')
      .populate('projectId', 'name')
      .sort('-createdAt');
    res.json(reqs);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const reqDoc = await EditRequest.findByIdAndUpdate(
      req.params.id,
      { status: decision, decidedBy: req.user.sub, decidedAt: new Date() },
      { new: true },
    );
    if (!reqDoc) return res.status(404).json({ error: 'not found' });
    res.json(reqDoc);
  }));

  return router;
}
