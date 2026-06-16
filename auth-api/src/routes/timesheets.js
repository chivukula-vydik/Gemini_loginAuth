import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

function isValidMonday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1;
}

function cleanMinutes(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sanitizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((t) => {
    const entries = {};
    for (const day of DAYS) entries[day] = cleanMinutes(t?.entries?.[day]);
    return { id: String(t?.id ?? ''), name: String(t?.name ?? ''), entries };
  });
}

export function createTimesheetRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const doc = await Timesheet.findOne({ userId: req.user.sub, weekStart });
    res.json({ weekStart, tasks: doc ? doc.tasks : [] });
  }));

  router.put('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const tasks = sanitizeTasks(req.body?.tasks);
    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId: req.user.sub, weekStart },
      { $set: { tasks, updatedAt }, $setOnInsert: { userId: req.user.sub, weekStart } },
      { upsert: true }
    );
    res.json({ ok: true, updatedAt });
  }));

  return router;
}
