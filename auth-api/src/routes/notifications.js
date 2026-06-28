import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Notification } from '../models/Notification.js';

export function createNotificationsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /notifications?cursor=<lastId>&limit=20
  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { recipient: req.user.sub };
    if (req.query.cursor) filter._id = { $lt: req.query.cursor };

    const items = await Notification.find(filter)
      .populate('actor', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items, cursor });
  }));

  // GET /notifications/unread-count
  router.get('/unread-count', asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ recipient: req.user.sub, read: false });
    res.json({ count });
  }));

  // POST /notifications/read-all — must come before /:id/read to avoid route conflict
  router.post('/read-all', asyncHandler(async (req, res) => {
    await Notification.updateMany({ recipient: req.user.sub, read: false }, { read: true });
    res.json({ ok: true });
  }));

  // POST /notifications/:id/read
  router.post('/:id/read', asyncHandler(async (req, res) => {
    const notif = await Notification.findOne({ _id: req.params.id, recipient: req.user.sub });
    if (!notif) return res.status(404).json({ error: 'not found' });
    notif.read = true;
    await notif.save();
    res.json({ ok: true });
  }));

  return router;
}
