import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { mergeWeekRows, sanitizeRows, currentMonday } from '../services/timesheetRows.js';
import { actualMinutesByTask } from '../services/actuals.js';

function isValidMonday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1;
}

export function createTimesheetRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    const savedRows = doc
      ? doc.tasks.map((t) => ({ id: t.id, name: t.name, entries: t.entries, taskId: t.taskId ? String(t.taskId) : null }))
      : [];
    const editable = weekStart >= currentMonday();

    let assignedTasks = [];
    if (editable) {
      assignedTasks = await Task.find({ assignee: userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours status');
    }

    const ids = new Set();
    for (const t of assignedTasks) ids.add(String(t._id));
    for (const r of savedRows) if (r.taskId) ids.add(r.taskId);
    const idList = [...ids];
    const actualMap = await actualMinutesByTask(idList);

    const infoTasks = idList.length
      ? await Task.find({ _id: { $in: idList } }).select('title percentComplete estimatedHours status')
      : [];
    const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
      title: t.title,
      percentComplete: t.percentComplete,
      estimatedHours: t.estimatedHours,
      status: t.status,
      actualMinutes: actualMap.get(String(t._id)) || 0,
    }]));

    const assignedForMerge = assignedTasks.map((t) => ({
      _id: String(t._id),
      title: t.title,
      percentComplete: t.percentComplete,
      estimatedHours: t.estimatedHours,
      status: t.status,
      actualMinutes: actualMap.get(String(t._id)) || 0,
    }));

    const tasks = mergeWeekRows({ savedRows, assignedTasks: assignedForMerge, taskInfoById, editable });
    res.json({ weekStart, tasks });
  }));

  router.put('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const assigned = await Task.find({ assignee: userId }).select('_id');
    const allowed = assigned.map((t) => String(t._id));
    const tasks = sanitizeRows(req.body?.tasks, allowed);
    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { tasks, updatedAt }, $setOnInsert: { userId, weekStart } },
      { upsert: true },
    );
    res.json({ ok: true, updatedAt });
  }));

  return router;
}
