import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { EditRequest } from '../models/EditRequest.js';
import {
  mergeWeekRows, assignableTasks, sanitizeRows, computeRowLock, currentMonday, todayDayFor, todayISO, DAYS,
  canSubmit, weekLocked,
} from '../services/timesheetRows.js';
import { actualMinutesByTask } from '../services/actuals.js';

function isValidMonday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1;
}

async function approvedGrantsFor(userId, weekStart) {
  const reqs = await EditRequest.find({ userId, weekStart, status: 'approved' }).select('day projectId');
  return reqs.map((r) => ({ day: r.day, projectId: String(r.projectId) }));
}

async function pendingGrantsFor(userId, weekStart) {
  const reqs = await EditRequest.find({ userId, weekStart, status: 'pending' }).select('day projectId');
  return reqs.map((r) => ({ day: r.day, projectId: String(r.projectId) }));
}

export function createTimesheetRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // PM/admin review queue. Registered before '/:weekStart' so 'review' is not
  // parsed as a weekStart. Not PM-scoped — every pm/admin sees all submissions.
  router.get('/review', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const status = req.query.status || 'submitted';
    const docs = await Timesheet.find({ status })
      .populate('userId', 'displayName email')
      .sort('-submittedAt');
    res.json(docs.map((d) => ({
      _id: String(d._id),
      user: d.userId
        ? { _id: String(d.userId._id), displayName: d.userId.displayName, email: d.userId.email }
        : null,
      weekStart: d.weekStart,
      submittedAt: d.submittedAt,
      totalMinutes: d.tasks.reduce(
        (sum, t) => sum + DAYS.reduce((a, day) => a + (t.entries?.[day] || 0), 0),
        0,
      ),
    })));
  }));

  router.patch('/review/:id', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'return'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const doc = await Timesheet.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.status !== 'submitted') return res.status(400).json({ error: 'timesheet is not awaiting review' });
    doc.status = decision === 'approve' ? 'approved' : 'returned';
    doc.reviewedBy = req.user.sub;
    doc.reviewedAt = new Date();
    await doc.save();
    res.json({ ok: true, status: doc.status });
  }));

  router.get('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    const savedRows = doc
      ? doc.tasks.map((t) => ({
          id: t.id, name: t.name, entries: t.entries,
          taskId: t.taskId ? String(t.taskId) : null,
          notes: t.notes || {},
        }))
      : [];

    // The picker offers the employee's assigned, non-done tasks (across all
    // projects) only for the current/future week. Past weeks are read-only.
    const pickable = weekStart >= currentMonday();
    let assignedTasks = [];
    if (pickable) {
      assignedTasks = await Task.find({ 'assignees.user': userId, status: { $ne: 'done' } })
        .select('title description status estimatedHours project')
        .populate('project', 'name');
    }

    // Saved linked rows are hydrated from live task metadata so names/actuals
    // stay current. Assigned tasks are no longer auto-injected (fork A).
    const idList = savedRows.filter((r) => r.taskId).map((r) => r.taskId);
    const actualMap = await actualMinutesByTask(idList);
    const infoTasks = idList.length
      ? await Task.find({ _id: { $in: idList } }).select('title description percentComplete estimatedHours status startDate project')
      : [];
    const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
      title: t.title, description: t.description || '', percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
      startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
      projectId: t.project ? String(t.project) : null,
    }]));

    const tasks = mergeWeekRows({ savedRows, taskInfoById });
    const assignable = assignableTasks(
      assignedTasks.map((t) => ({
        _id: String(t._id), title: t.title, description: t.description || '', status: t.status,
        estimatedHours: t.estimatedHours, projectName: t.project ? t.project.name : null,
      })),
      savedRows,
    );

    const grants = await approvedGrantsFor(userId, weekStart);
    const pending = await pendingGrantsFor(userId, weekStart);
    const status = doc?.status || 'draft';
    // Once submitted/approved, "today" is no longer auto-editable — only approved
    // grants punch through. Mirrors the PUT handler's lock logic.
    const todayDay = weekLocked(status) ? null : todayDayFor(weekStart, todayISO());
    const readOnly = (weekStart < currentMonday() && grants.length === 0) || weekLocked(status);
    res.json({
      weekStart, tasks, assignable, todayDay, grants, pending, readOnly,
      status,
      submittedAt: doc?.submittedAt || null,
      reviewedAt: doc?.reviewedAt || null,
    });
  }));

  router.put('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const assigned = await Task.find({ 'assignees.user': userId }).select('_id project startDate');
    const allowed = assigned.map((t) => String(t._id));
    const taskProjectById = new Map(assigned.map((t) => [String(t._id), String(t.project)]));
    const taskStartById = new Map(assigned.map((t) => [
      String(t._id), t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    ]));
    const sanitized = sanitizeRows(req.body?.tasks, allowed);

    const doc = await Timesheet.findOne({ userId, weekStart });
    const savedRows = doc ? doc.tasks : [];
    const grants = await approvedGrantsFor(userId, weekStart);
    const status = doc?.status || 'draft';
    // Once submitted/approved, "today" is no longer auto-editable; only approved
    // grants punch through. Passing todayDay=null achieves exactly that.
    const todayDay = weekLocked(status) ? null : todayDayFor(weekStart, todayISO());
    const { rows, consumed } = computeRowLock({ submittedRows: sanitized, savedRows, taskProjectById, taskStartById, weekStart, todayDay, grants });

    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { tasks: rows, updatedAt }, $setOnInsert: { userId, weekStart } },
      { upsert: true },
    );
    for (const g of consumed) {
      await EditRequest.updateOne(
        { userId, weekStart, day: g.day, projectId: g.projectId, status: 'approved' },
        { $set: { status: 'used' } },
      );
    }
    res.json({ ok: true, updatedAt });
  }));

  router.post('/:weekStart/submit', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    const status = doc?.status || 'draft';
    if (!canSubmit(status, weekStart, currentMonday())) {
      return res.status(409).json({ error: 'this week cannot be submitted' });
    }
    const submittedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { status: 'submitted', submittedAt, reviewedAt: null, reviewedBy: null }, $setOnInsert: { userId, weekStart } },
      { upsert: true },
    );
    res.json({ ok: true, status: 'submitted', submittedAt });
  }));

  router.post('/:weekStart/edit-requests', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    // Requests are a previous-week concept only; the current/future week has no request process.
    if (weekStart >= currentMonday()) return res.status(400).json({ error: 'requests are only for previous weeks' });
    const day = req.body?.day;
    if (!DAYS.includes(day)) return res.status(400).json({ error: 'invalid day' });
    const projectId = req.body?.projectId;
    if (!projectId || !mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: 'invalid projectId' });
    const userId = req.user.sub;
    if (todayDayFor(weekStart, todayISO()) === day) return res.status(400).json({ error: 'that day is already editable' });
    const idx = DAYS.indexOf(day);
    const dayDate = new Date(`${weekStart}T00:00:00Z`);
    dayDate.setUTCDate(dayDate.getUTCDate() + idx);
    if (dayDate.toISOString().slice(0, 10) >= todayISO()) {
      return res.status(400).json({ error: 'can only request edits for a past day' });
    }
    const hasTask = await Task.exists({ 'assignees.user': userId, project: projectId });
    if (!hasTask) return res.status(400).json({ error: 'no task on that project' });
    const existing = await EditRequest.findOne({ userId, weekStart, day, projectId, status: { $in: ['pending', 'approved'] } });
    if (existing) return res.status(409).json({ error: 'a request for this day already exists' });
    const reqDoc = await EditRequest.create({ userId, weekStart, day, projectId, reason: String(req.body?.reason || '') });
    res.status(201).json(reqDoc);
  }));

  return router;
}
