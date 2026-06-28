import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { InboxMessage } from '../models/InboxMessage.js';

export function createInboxRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /inbox?cursor=<lastId>&limit=20
  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { recipient: req.user.sub };
    if (req.query.cursor) filter._id = { $lt: req.query.cursor };

    const items = await InboxMessage.find(filter)
      .populate('sender', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items, cursor });
  }));

  // GET /inbox/unread-count
  router.get('/unread-count', asyncHandler(async (req, res) => {
    const count = await InboxMessage.countDocuments({ recipient: req.user.sub, read: false });
    res.json({ count });
  }));

  // POST /inbox/wish
  router.post('/wish', asyncHandler(async (req, res) => {
    const { recipientId, body } = req.body;
    if (!recipientId) return res.status(400).json({ error: 'recipientId is required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
    if (String(recipientId) === String(req.user.sub)) {
      return res.status(400).json({ error: 'cannot wish yourself' });
    }
    const msg = await InboxMessage.create({
      recipient: recipientId,
      sender: req.user.sub,
      type: 'birthday_wish',
      body: body.trim(),
    });
    const populated = await InboxMessage.findById(msg._id).populate('sender', 'displayName email');
    res.status(201).json(populated);
  }));

  // POST /inbox/read-all  — must come before /:id/read to avoid route conflict
  router.post('/read-all', asyncHandler(async (req, res) => {
    await InboxMessage.updateMany({ recipient: req.user.sub, read: false }, { read: true });
    res.json({ ok: true });
  }));

  // POST /inbox/:id/read
  router.post('/:id/read', asyncHandler(async (req, res) => {
    const msg = await InboxMessage.findOne({ _id: req.params.id, recipient: req.user.sub });
    if (!msg) return res.status(404).json({ error: 'not found' });
    msg.read = true;
    await msg.save();
    res.json({ ok: true });
  }));

  return router;
}
