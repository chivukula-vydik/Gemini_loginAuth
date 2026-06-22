import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Holiday } from '../models/Holiday.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createHolidaysRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /holidays?year=2026 — any authed user (needed to render the calendar)
  router.get('/', asyncHandler(async (req, res) => {
    const { year } = req.query;
    const filter = year ? { year: Number(year) } : {};
    const docs = await Holiday.find(filter).sort({ date: 1 });
    res.json(docs);
  }));

  // POST /holidays — admin only
  router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
    const { date, name } = req.body;
    if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (!String(name || '').trim()) return res.status(400).json({ error: 'name required' });

    const exists = await Holiday.findOne({ date });
    if (exists) return res.status(409).json({ error: 'a holiday already exists for that date' });

    const doc = await Holiday.create({ date, name: name.trim(), year: Number(date.slice(0, 4)) });
    res.status(201).json(doc);
  }));

  // DELETE /holidays/:id — admin only
  router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const doc = await Holiday.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  }));

  return router;
}
