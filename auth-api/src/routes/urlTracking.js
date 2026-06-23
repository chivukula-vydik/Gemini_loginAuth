import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { UrlActivity } from '../models/UrlActivity.js';
import { UrlCategory } from '../models/UrlCategory.js';
import { User } from '../models/User.js';

function categorizeUrl(url, rules) {
  try {
    const hostname = new URL(url).hostname;
    for (const rule of rules) {
      if (hostname.includes(rule.pattern) || url.includes(rule.pattern)) {
        return rule.category;
      }
    }
  } catch { /* invalid URL */ }
  return 'neutral';
}

export function createUrlTrackingRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/activities', asyncHandler(async (req, res) => {
    const { activities } = req.body || {};
    if (!Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({ error: 'activities array required' });
    }
    if (activities.length > 100) {
      return res.status(400).json({ error: 'max 100 activities per request' });
    }

    const rules = await UrlCategory.find();
    const docs = activities.map((a) => ({
      userId: req.user.sub,
      url: String(a.url || ''),
      title: String(a.title || ''),
      category: categorizeUrl(a.url, rules),
      startedAt: new Date(a.startedAt),
      endedAt: a.endedAt ? new Date(a.endedAt) : null,
      durationMs: a.endedAt && a.startedAt
        ? Math.max(0, new Date(a.endedAt) - new Date(a.startedAt))
        : 0,
      source: 'api',
    }));

    const inserted = await UrlActivity.insertMany(docs);
    res.status(201).json({ count: inserted.length });
  }));

  router.get('/activities', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    let userFilter;
    if (req.user.role === 'admin' || req.user.role === 'pm') {
      userFilter = {};
    } else if (req.user.role === 'reporting_manager') {
      const team = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      userFilter = { userId: { $in: [req.user.sub, ...team.map((u) => u._id)] } };
    } else {
      userFilter = { userId: req.user.sub };
    }

    const activities = await UrlActivity.find({
      ...userFilter,
      startedAt: { $gte: new Date(startDate), $lte: new Date(endDate + 'T23:59:59Z') },
    }).populate('userId', 'displayName email').sort({ startedAt: -1 }).limit(500);

    res.json(activities);
  }));

  router.get('/summary', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    let matchFilter = {
      startedAt: { $gte: new Date(startDate), $lte: new Date(endDate + 'T23:59:59Z') },
    };
    if (req.user.role === 'reporting_manager') {
      const team = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      matchFilter.userId = { $in: [req.user.sub, ...team.map((u) => u._id)] };
    } else if (req.user.role === 'employee') {
      matchFilter.userId = req.user.sub;
    }

    const byCategory = await UrlActivity.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$category', totalMs: { $sum: '$durationMs' } } },
    ]);

    const topUrls = await UrlActivity.aggregate([
      { $match: matchFilter },
      { $group: { _id: { url: '$url', category: '$category' }, totalMs: { $sum: '$durationMs' } } },
      { $sort: { totalMs: -1 } },
      { $limit: 20 },
      { $project: { _id: 0, url: '$_id.url', category: '$_id.category', totalMs: 1 } },
    ]);

    const byUser = await UrlActivity.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$userId', totalMs: { $sum: '$durationMs' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, userId: '$_id', displayName: '$user.displayName', totalMs: 1 } },
    ]);

    const categoryMap = {};
    for (const c of byCategory) { categoryMap[c._id] = c.totalMs; }

    res.json({ byCategory: categoryMap, topUrls, byUser });
  }));

  router.post('/categories', requireRole('admin'), asyncHandler(async (req, res) => {
    const { pattern, category, label } = req.body || {};
    if (!pattern) return res.status(400).json({ error: 'pattern required' });
    if (!['productive', 'neutral', 'non-productive'].includes(category)) {
      return res.status(400).json({ error: 'invalid category' });
    }
    const doc = await UrlCategory.create({
      pattern: String(pattern).trim(),
      category,
      label: String(label || ''),
    });
    res.status(201).json(doc);
  }));

  router.get('/categories', asyncHandler(async (req, res) => {
    const cats = await UrlCategory.find().sort('pattern');
    res.json(cats);
  }));

  router.patch('/categories/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const update = {};
    if (typeof req.body?.pattern === 'string') update.pattern = req.body.pattern.trim();
    if (['productive', 'neutral', 'non-productive'].includes(req.body?.category)) update.category = req.body.category;
    if (typeof req.body?.label === 'string') update.label = req.body.label;
    const doc = await UrlCategory.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  }));

  router.delete('/categories/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const doc = await UrlCategory.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  }));

  return router;
}
