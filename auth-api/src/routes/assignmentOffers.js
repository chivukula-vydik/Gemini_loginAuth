import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AssignmentOffer } from '../models/AssignmentOffer.js';
import { Task } from '../models/Task.js';

export function createAssignmentOffersRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(async (req, res) => {
    const offers = await AssignmentOffer.find({ userId: req.user.sub, status: 'pending' })
      .populate({ path: 'taskId', select: 'title project', populate: { path: 'project', select: 'name' } })
      .sort('-createdAt');
    res.json(offers
      .filter((o) => o.taskId)
      .map((o) => ({
        _id: o._id,
        task: { _id: o.taskId._id, title: o.taskId.title },
        project: { name: o.taskId.project ? o.taskId.project.name : '' },
        createdAt: o.createdAt,
      })));
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['accept', 'decline'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const offer = await AssignmentOffer.findById(req.params.id);
    if (!offer) return res.status(404).json({ error: 'not found' });
    if (String(offer.userId) !== String(req.user.sub)) return res.status(403).json({ error: 'forbidden' });
    if (offer.status !== 'pending') return res.status(409).json({ error: 'offer already resolved' });

    if (decision === 'accept') {
      const task = await Task.findById(offer.taskId);
      if (!task) return res.status(404).json({ error: 'task not found' });
      if (task.assignee || task.status === 'done') return res.status(409).json({ error: 'task no longer available' });
      task.assignee = offer.userId;
      await task.save();
    }
    offer.status = decision === 'accept' ? 'accepted' : 'declined';
    offer.decidedAt = new Date();
    await offer.save();
    res.json(offer);
  }));

  return router;
}
