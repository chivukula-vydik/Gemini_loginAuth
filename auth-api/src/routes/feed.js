import express from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { FeedItem, FEED_TYPES, PRAISE_CATEGORIES } from '../models/FeedItem.js';
import { PollVote } from '../models/PollVote.js';
import { InboxMessage } from '../models/InboxMessage.js';
import { Notification } from '../models/Notification.js';

async function tallyVotes(pollId) {
  const votes = await PollVote.find({ pollId });
  const counts = {};
  for (const v of votes) {
    for (const idx of v.optionIndices) {
      counts[idx] = (counts[idx] || 0) + 1;
    }
  }
  return counts;
}

function sanitiseItem(item, userId) {
  const obj = item.toObject ? item.toObject() : { ...item };
  delete obj.pollSalt;
  delete obj.pollVoterHashes;
  obj.likeCount = (obj.likes || []).length;
  obj.liked = (obj.likes || []).some((id) => String(id) === String(userId));
  obj.commentCount = (obj.comments || []).filter((c) => c.status === 'active').length;
  obj.comments = (obj.comments || []).filter((c) => c.status === 'active');
  return obj;
}

export function createFeedRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /feed?cursor=<lastId>&limit=20
  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const now = new Date();

    const pinned = await FeedItem.find({
      type: 'announcement', status: 'active', pinnedUntil: { $gt: now },
    })
      .populate('author', 'displayName email')
      .sort({ createdAt: -1 });

    const pinnedIds = pinned.map((p) => p._id);
    const filter = { status: 'active', _id: { $nin: pinnedIds } };
    if (req.query.cursor) filter._id = { ...filter._id, $lt: req.query.cursor };

    const items = await FeedItem.find(filter)
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email')
      .populate('comments.author', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const all = [...pinned, ...items];

    const pollIds = all.filter((i) => i.type === 'poll').map((i) => i._id);
    const allVotes = pollIds.length > 0
      ? await PollVote.find({ pollId: { $in: pollIds } })
      : [];

    const tallyMap = {};
    for (const v of allVotes) {
      const key = String(v.pollId);
      if (!tallyMap[key]) tallyMap[key] = {};
      for (const idx of v.optionIndices) {
        tallyMap[key][idx] = (tallyMap[key][idx] || 0) + 1;
      }
    }

    const userId = req.user.sub;
    const result = all.map((item) => {
      const obj = sanitiseItem(item, userId);
      if (item.type === 'poll') {
        obj.voteTally = tallyMap[String(item._id)] || {};
        const myVote = allVotes.find(
          (v) => String(v.pollId) === String(item._id) && String(v.userId) === String(userId),
        );
        obj.myVote = myVote ? myVote.optionIndices : null;
      }
      return obj;
    });

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items: result, cursor });
  }));

  // GET /feed/mine — caller's own posts
  router.get('/mine', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { author: req.user.sub, status: 'active' };
    if (req.query.cursor) filter._id = { $lt: req.query.cursor };

    const items = await FeedItem.find(filter)
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email')
      .populate('comments.author', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const userId = req.user.sub;
    const result = items.map((item) => sanitiseItem(item, userId));

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items: result, cursor });
  }));

  // GET /feed/:id
  router.get('/:id', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active' })
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email')
      .populate('comments.author', 'displayName email');
    if (!item) return res.status(404).json({ error: 'not found' });

    const obj = sanitiseItem(item, req.user.sub);
    if (item.type === 'poll') {
      obj.voteTally = await tallyVotes(item._id);
      const myVote = await PollVote.findOne({ pollId: item._id, userId: req.user.sub });
      obj.myVote = myVote ? myVote.optionIndices : null;
    }
    res.json(obj);
  }));

  // POST /feed
  router.post('/', asyncHandler(async (req, res) => {
    const { type, body, pollOptions, pollMultiChoice, pollAnonymous, praiseTarget, praiseCategory } = req.body;
    if (!FEED_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

    const roles = req.user.roles || [req.user.role || 'employee'];
    const doc = { type, author: req.user.sub, body: body.trim() };

    if (type === 'announcement') {
      if (!roles.includes('admin') && !roles.includes('hr')) {
        return res.status(403).json({ error: 'only admin/hr can create announcements' });
      }
      const activeCount = await FeedItem.countDocuments({
        type: 'announcement', status: 'active', pinnedUntil: { $gt: new Date() },
      });
      if (activeCount >= 3) return res.status(400).json({ error: 'max 3 active announcements' });
      doc.pinnedUntil = new Date(Date.now() + 30 * 86400000);
    }

    if (type === 'poll') {
      if (!Array.isArray(pollOptions) || pollOptions.length < 2) {
        return res.status(400).json({ error: 'polls need at least 2 options' });
      }
      doc.pollOptions = pollOptions.map((o) => ({ text: String(o.text || o).trim() }));
      doc.pollMultiChoice = !!pollMultiChoice;
      doc.pollAnonymous = !!pollAnonymous;
      doc.pollSalt = crypto.randomBytes(16).toString('hex');
    }

    if (type === 'praise') {
      if (!praiseTarget) return res.status(400).json({ error: 'praiseTarget is required' });
      if (String(praiseTarget) === String(req.user.sub)) {
        return res.status(400).json({ error: 'cannot praise yourself' });
      }
      doc.praiseTarget = praiseTarget;
      if (praiseCategory && PRAISE_CATEGORIES.includes(praiseCategory)) {
        doc.praiseCategory = praiseCategory;
      }
    }

    const item = await FeedItem.create(doc);

    // Fire-and-forget praise notification — started before the populate await so
    // it runs concurrently and is guaranteed to land before the response is sent.
    if (type === 'praise' && praiseTarget) {
      InboxMessage.create({
        recipient: praiseTarget,
        sender: req.user.sub,
        type: 'praise',
        body: body.trim(),
        refItem: item._id,
      }).catch((e) => console.error('[notify] praise error:', e.message));
    }

    const populated = await FeedItem.findById(item._id)
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email');
    const result = sanitiseItem(populated, req.user.sub);
    if (type === 'poll') {
      result.voteTally = {};
      result.myVote = null;
    }
    res.status(201).json(result);
  }));

  // DELETE /feed/:id
  router.delete('/:id', asyncHandler(async (req, res) => {
    const item = await FeedItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    const roles = req.user.roles || [req.user.role || 'employee'];
    const isOwner = String(item.author) === String(req.user.sub);
    const isAdmin = roles.includes('admin') || roles.includes('hr');
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'forbidden' });
    item.status = 'hidden';
    await item.save();
    res.json({ ok: true });
  }));

  // POST /feed/:id/like
  router.post('/:id/like', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active' });
    if (!item) return res.status(404).json({ error: 'not found' });
    if (item.type === 'announcement') return res.status(400).json({ error: 'cannot like announcements' });

    const uid = req.user.sub;
    const already = item.likes.some((id) => String(id) === String(uid));
    if (already) {
      await FeedItem.updateOne({ _id: item._id }, { $pull: { likes: uid } });
    } else {
      await FeedItem.updateOne({ _id: item._id }, { $addToSet: { likes: uid } });
    }
    const updated = await FeedItem.findById(item._id);
    res.json({ liked: !already, likeCount: updated.likes.length });

    if (!already && String(item.author) !== String(uid)) {
      Notification.findOneAndUpdate(
        { recipient: item.author, actor: uid, type: 'like', refItem: item._id, read: false },
        { recipient: item.author, actor: uid, type: 'like', refItem: item._id, refModel: 'FeedItem' },
        { upsert: true },
      ).catch((e) => console.error('[notify] like error:', e.message));
    }
  }));

  // POST /feed/:id/comment
  router.post('/:id/comment', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active' });
    if (!item) return res.status(404).json({ error: 'not found' });
    if (item.type === 'announcement') return res.status(400).json({ error: 'cannot comment on announcements' });

    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

    item.comments.push({ author: req.user.sub, body: body.trim() });
    await item.save();

    // Fire-and-forget notification — started before the populate await so it
    // runs concurrently and is guaranteed to land before the response is sent.
    if (String(item.author) !== String(req.user.sub)) {
      InboxMessage.create({
        recipient: item.author,
        sender: req.user.sub,
        type: 'comment',
        body: body.trim(),
        refItem: item._id,
      }).catch((e) => console.error('[notify] comment error:', e.message));
    }

    const populated = await FeedItem.findById(item._id)
      .populate('comments.author', 'displayName email');
    const obj = sanitiseItem(populated, req.user.sub);
    res.status(201).json(obj);
  }));

  // DELETE /feed/:id/comment/:commentId
  router.delete('/:id/comment/:commentId', asyncHandler(async (req, res) => {
    const item = await FeedItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    const comment = item.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'comment not found' });
    const roles = req.user.roles || [req.user.role || 'employee'];
    const isCommentAuthor = String(comment.author) === String(req.user.sub);
    const isAdmin = roles.includes('admin') || roles.includes('hr');
    if (!isCommentAuthor && !isAdmin) return res.status(403).json({ error: 'forbidden' });
    comment.status = 'hidden';
    await item.save();
    res.json({ ok: true });
  }));

  // POST /feed/:id/vote
  router.post('/:id/vote', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active', type: 'poll' })
      .select('+pollSalt');
    if (!item) return res.status(404).json({ error: 'poll not found' });

    const { optionIndices } = req.body;
    if (!Array.isArray(optionIndices) || optionIndices.length === 0) {
      return res.status(400).json({ error: 'optionIndices required' });
    }
    if (!item.pollMultiChoice && optionIndices.length > 1) {
      return res.status(400).json({ error: 'single-choice poll: pick one option' });
    }
    const maxIdx = item.pollOptions.length - 1;
    if (optionIndices.some((i) => i < 0 || i > maxIdx)) {
      return res.status(400).json({ error: 'invalid option index' });
    }

    if (item.pollAnonymous) {
      const hash = crypto.createHash('sha256')
        .update(item.pollSalt + ':' + req.user.sub)
        .digest('hex');
      if (item.pollVoterHashes.includes(hash)) {
        return res.status(409).json({ error: 'already voted' });
      }
      await PollVote.create({ pollId: item._id, userId: null, optionIndices });
      await FeedItem.updateOne({ _id: item._id }, { $push: { pollVoterHashes: hash } });
    } else {
      await PollVote.findOneAndUpdate(
        { pollId: item._id, userId: req.user.sub },
        { optionIndices },
        { upsert: true },
      );
    }

    const tally = await tallyVotes(item._id);
    res.json({ voteTally: tally, myVote: optionIndices });
  }));

  // PATCH /feed/:id/moderate
  router.patch('/:id/moderate', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
    const { status, commentId } = req.body;
    if (!['hidden', 'active'].includes(status)) {
      return res.status(400).json({ error: 'status must be hidden or active' });
    }
    const item = await FeedItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });

    if (commentId) {
      const comment = item.comments.id(commentId);
      if (!comment) return res.status(404).json({ error: 'comment not found' });
      comment.status = status;
      await item.save();
    } else {
      item.status = status;
      await item.save();
    }
    res.json({ ok: true });
  }));

  return router;
}
