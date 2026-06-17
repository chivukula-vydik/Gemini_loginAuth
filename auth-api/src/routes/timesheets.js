import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { EditRequest } from '../models/EditRequest.js';
import {
  mergeWeekRows, sanitizeRows, applyDayLock, currentMonday, editableDaysFor, todayISO, DAYS,
} from '../services/timesheetRows.js';
import { actualMinutesByTask } from '../services/actuals.js';

function isValidMonday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1;
}

async function approvedDaysFor(userId, weekStart) {
  const reqs = await EditRequest.find({ userId, weekStart, status: 'approved' }).select('day');
  return reqs.map((r) => r.day);
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
    const injectable = weekStart >= currentMonday();

    let assignedTasks = [];
    if (injectable) {
      assignedTasks = await Task.find({ assignee: userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours status startDate');
    }

    const ids = new Set();
    for (const t of assignedTasks) ids.add(String(t._id));
    for (const r of savedRows) if (r.taskId) ids.add(r.taskId);
    const idList = [...ids];
    const actualMap = await actualMinutesByTask(idList);

    const infoTasks = idList.length
      ? await Task.find({ _id: { $in: idList } }).select('title percentComplete estimatedHours status startDate')
      : [];
    const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
      title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
      startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    }]));
    const assignedForMerge = assignedTasks.map((t) => ({
      _id: String(t._id), title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
      startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    }));

    const tasks = mergeWeekRows({ savedRows, assignedTasks: assignedForMerge, taskInfoById, editable: injectable });

    const approved = await approvedDaysFor(userId, weekStart);
    const editableDays = editableDaysFor(weekStart, todayISO(), approved);
    const readOnly = weekStart < currentMonday() && editableDays.length === 0;

    res.json({ weekStart, tasks, editableDays, readOnly });
  }));

  router.put('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const assigned = await Task.find({ assignee: userId }).select('_id');
    const allowed = assigned.map((t) => String(t._id));
    const sanitized = sanitizeRows(req.body?.tasks, allowed);

    const doc = await Timesheet.findOne({ userId, weekStart });
    const savedRows = doc ? doc.tasks : [];
    const approved = await approvedDaysFor(userId, weekStart);
    const editableDays = editableDaysFor(weekStart, todayISO(), approved);
    const tasks = applyDayLock(sanitized, savedRows, editableDays);

    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { tasks, updatedAt }, $setOnInsert: { userId, weekStart } },
      { upsert: true },
    );
    res.json({ ok: true, updatedAt });
  }));

  router.post('/:weekStart/edit-requests', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const day = req.body?.day;
    if (!DAYS.includes(day)) return res.status(400).json({ error: 'invalid day' });
    const userId = req.user.sub;
    const editableDays = editableDaysFor(weekStart, todayISO(), []);
    if (editableDays.includes(day)) return res.status(400).json({ error: 'that day is already editable' });
    const idx = DAYS.indexOf(day);
    const dayDate = new Date(`${weekStart}T00:00:00Z`);
    dayDate.setUTCDate(dayDate.getUTCDate() + idx);
    if (dayDate.toISOString().slice(0, 10) >= todayISO()) {
      return res.status(400).json({ error: 'can only request edits for a past day' });
    }
    const existing = await EditRequest.findOne({ userId, weekStart, day, status: { $in: ['pending', 'approved'] } });
    if (existing) return res.status(409).json({ error: 'a request for this day already exists' });
    const reqDoc = await EditRequest.create({ userId, weekStart, day, reason: String(req.body?.reason || '') });
    res.status(201).json(reqDoc);
  }));

  return router;
}
