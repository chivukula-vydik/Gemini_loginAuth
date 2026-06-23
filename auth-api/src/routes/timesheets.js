import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { EditRequest } from '../models/EditRequest.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import {
  mergeWeekRows, assignableTasks, sanitizeRows, computeRowLock, currentMonday, todayDayFor, todayISO, DAYS,
  weekLocked, derivedStatus,
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'timesheetFiles' });
}

export function createTimesheetRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // PM/admin review queue. Registered before '/:weekStart' so 'review' is not
  // parsed as a weekStart. Not PM-scoped — every pm/admin sees all submissions.
  router.get('/review', requireRole('pm', 'admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const status = req.query.status || 'submitted';
    const filter = { status };
    if (req.user.role === 'reporting_manager') {
      const teamIds = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamIds.map((u) => u._id) };
    }
    const docs = await Timesheet.find(filter)
      .populate('userId', 'displayName email')
      .sort('-submittedAt');
    res.json(docs.map((d) => {
      let billableMinutes = 0;
      let nonBillableMinutes = 0;
      for (const t of d.tasks || []) {
        for (const day of DAYS) {
          const mins = t.entries?.[day] || 0;
          if (mins > 0) {
            const isBillable = t.billable?.[day] != null ? t.billable[day] : false;
            if (isBillable) billableMinutes += mins;
            else nonBillableMinutes += mins;
          }
        }
      }
      return {
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
        billableMinutes,
        nonBillableMinutes,
      };
    }));
  }));

  router.patch('/review/:id', requireRole('pm', 'admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'return'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const doc = await Timesheet.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });

    const requestedDays = Array.isArray(req.body?.days) ? req.body.days.filter((d) => DAYS.includes(d)) : [];
    const ds = doc.dayStatus || {};
    let toReview = requestedDays.length > 0
      ? requestedDays.filter((d) => (ds[d]?.status || 'draft') === 'submitted')
      : DAYS.filter((d) => (ds[d]?.status || 'draft') === 'submitted');

    // Back-compat: legacy/seeded docs may carry a week-level 'submitted' status
    // without any per-day dayStatus populated. Treat every day as submittable
    // in that case so older submit flows still review correctly.
    if (toReview.length === 0 && doc.status === 'submitted') {
      toReview = DAYS;
    }

    if (toReview.length === 0) return res.status(400).json({ error: 'no submitted days to review' });

    const now = new Date();
    const reason = decision === 'return' ? String(req.body?.reason || '').trim().slice(0, 1000) : '';
    const update = {};
    for (const d of toReview) {
      update[`dayStatus.${d}.status`] = decision === 'approve' ? 'approved' : 'returned';
      update[`dayStatus.${d}.reviewedAt`] = now;
      update[`dayStatus.${d}.reviewedBy`] = req.user.sub;
      update[`dayStatus.${d}.rejectionReason`] = reason;
    }

    const newDs = {};
    for (const d of DAYS) {
      newDs[d] = update[`dayStatus.${d}.status`]
        ? { ...(ds[d] || {}), status: update[`dayStatus.${d}.status`] }
        : (ds[d] || { status: 'draft' });
    }
    // When there are no day entries to derive a status from (e.g. a legacy
    // doc with no tasks), fall back to the decision itself so empty test/seed
    // timesheets still resolve to approved/returned rather than draft.
    const hasEntries = (doc.tasks || []).some((t) => DAYS.some((d) => (t.entries?.[d] || 0) > 0));
    update.status = hasEntries
      ? derivedStatus(newDs, doc.tasks)
      : (decision === 'approve' ? 'approved' : 'returned');
    update.reviewedBy = req.user.sub;
    update.reviewedAt = now;
    update.rejectionReason = reason;

    await Timesheet.updateOne({ _id: doc._id }, { $set: update });
    res.json({ ok: true, status: update.status, dayStatus: newDs });
  }));

  router.get('/review/:id/notes', requireRole('pm', 'admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const doc = await Timesheet.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    const rows = [];
    for (const t of doc.tasks) {
      for (const d of DAYS) {
        const note = t.notes?.[d] || '';
        if (!note) continue;
        rows.push({
          taskName: t.name || 'Untitled',
          day: d,
          minutes: t.entries?.[d] || 0,
          note,
        });
      }
    }
    res.json(rows);
  }));

  router.get('/attachments/:fileId', asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) return res.status(400).json({ error: 'invalid fileId' });
    const bucket = getBucket();
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    if (files.length === 0) return res.status(404).json({ error: 'file not found' });
    const file = files[0];
    const meta = file.metadata || {};
    if (String(meta.userId) !== String(req.user.sub) && !['pm', 'admin', 'reporting_manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    bucket.openDownloadStream(file._id).pipe(res);
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

    const projectIds = [...new Set(infoTasks.map((t) => String(t.project)).filter(Boolean))];
    const billingProjects = projectIds.length
      ? await Project.find({ _id: { $in: projectIds } }).select('billingType')
      : [];
    const billingByProject = new Map(billingProjects.map((p) => [String(p._id), p.billingType === 'billable']));

    const tasks = mergeWeekRows({ savedRows, taskInfoById });
    const tasksWithBillable = tasks.map((t) => {
      const savedRow = (doc?.tasks || []).find((s) => s.id === t.id);
      const projectBillable = t.projectId ? (billingByProject.get(t.projectId) ?? false) : false;
      const billableRaw = savedRow?.billable || {};
      const effectiveBillable = {};
      for (const d of DAYS) {
        effectiveBillable[d] = billableRaw[d] != null ? billableRaw[d] : projectBillable;
      }
      return { ...t, billable: billableRaw, effectiveBillable };
    });
    const assignable = assignableTasks(
      assignedTasks.map((t) => ({
        _id: String(t._id), title: t.title, description: t.description || '', status: t.status,
        estimatedHours: t.estimatedHours, projectName: t.project ? t.project.name : null,
      })),
      savedRows,
    );

    const userProjects = await Project.find({ members: userId, status: 'active' }).select('name');

    const grants = await approvedGrantsFor(userId, weekStart);
    const pending = await pendingGrantsFor(userId, weekStart);
    const status = doc?.status || 'draft';
    // Once submitted/approved, "today" is no longer auto-editable — only approved
    // grants punch through. Mirrors the PUT handler's lock logic.
    const todayDay = weekLocked(status) ? null : todayDayFor(weekStart, todayISO());
    const readOnly = (weekStart < currentMonday() && grants.length === 0) || weekLocked(status);
    const targetUser = await User.findById(userId).select('weeklyTargetMinutes');
    const orgDefault = req.app.locals.weeklyTargetMinutes ?? 2400;
    const targetMinutes = targetUser?.weeklyTargetMinutes ?? orgDefault;

    const ds = doc?.dayStatus || {};
    const dayStatusOut = {};
    for (const d of DAYS) {
      dayStatusOut[d] = {
        status: ds[d]?.status || 'draft',
        submittedAt: ds[d]?.submittedAt || null,
        reviewedAt: ds[d]?.reviewedAt || null,
        rejectionReason: ds[d]?.rejectionReason || '',
      };
    }

    res.json({
      weekStart, tasks: tasksWithBillable, assignable, todayDay, grants, pending, readOnly,
      status,
      submittedAt: doc?.submittedAt || null,
      reviewedAt: doc?.reviewedAt || null,
      rejectionReason: doc?.rejectionReason || '',
      dayStatus: dayStatusOut,
      targetMinutes,
      projects: userProjects.map((p) => ({ _id: String(p._id), name: p.name })),
      attachments: (doc?.attachments || []).map((a) => ({
        fileId: String(a.fileId), filename: a.filename, contentType: a.contentType,
        size: a.size, uploadedAt: a.uploadedAt,
      })),
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
    const ds = doc?.dayStatus || {};
    const { rows, consumed } = computeRowLock({ submittedRows: sanitized, savedRows, taskProjectById, taskStartById, weekStart, todayDay, grants, dayStatus: ds });

    const billableByRowId = new Map(
      (Array.isArray(req.body?.tasks) ? req.body.tasks : [])
        .filter((t) => t?.id && t?.billable)
        .map((t) => [t.id, t.billable]),
    );
    const rowsWithBillable = rows.map((r) => ({
      ...r,
      billable: billableByRowId.get(r.id) || r.billable || {},
    }));

    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { tasks: rowsWithBillable, updatedAt }, $setOnInsert: { userId, weekStart } },
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
    if (weekStart > currentMonday()) return res.status(409).json({ error: 'cannot submit a future week' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    if (!doc) return res.status(404).json({ error: 'no timesheet found' });

    const requestedDays = Array.isArray(req.body?.days) ? req.body.days.filter((d) => DAYS.includes(d)) : [];
    const ds = doc.dayStatus || {};
    const now = new Date();

    // If no days specified, submit all draft/returned non-empty days.
    const dayTotals = {};
    for (const d of DAYS) {
      dayTotals[d] = (doc.tasks || []).reduce((sum, t) => sum + (t.entries?.[d] || 0), 0);
    }
    const toSubmit = requestedDays.length > 0
      ? requestedDays
      : DAYS.filter((d) => dayTotals[d] > 0 && ['draft', 'returned'].includes(ds[d]?.status || 'draft'));

    if (toSubmit.length === 0) return res.status(409).json({ error: 'no submittable days' });

    const update = {};
    for (const d of toSubmit) {
      const dayS = ds[d]?.status || 'draft';
      if (dayS !== 'draft' && dayS !== 'returned') continue;
      update[`dayStatus.${d}.status`] = 'submitted';
      update[`dayStatus.${d}.submittedAt`] = now;
      update[`dayStatus.${d}.reviewedAt`] = null;
      update[`dayStatus.${d}.reviewedBy`] = null;
      update[`dayStatus.${d}.rejectionReason`] = '';
    }

    if (Object.keys(update).length === 0) return res.status(409).json({ error: 'no submittable days' });

    // Derive week-level status after update.
    const newDs = { ...ds };
    for (const d of DAYS) {
      if (update[`dayStatus.${d}.status`]) {
        newDs[d] = { ...(newDs[d] || {}), status: update[`dayStatus.${d}.status`] };
      }
    }
    const hasEntries = (doc.tasks || []).some((t) => DAYS.some((d) => (t.entries?.[d] || 0) > 0));
    const newStatus = hasEntries ? derivedStatus(newDs, doc.tasks) : 'submitted';
    update.status = newStatus;
    if (newStatus === 'submitted') update.submittedAt = now;

    await Timesheet.updateOne({ userId, weekStart }, { $set: update });
    res.json({ ok: true, status: newStatus, dayStatus: newDs });
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

  router.post('/tasks', asyncHandler(async (req, res) => {
    const { title, projectId } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    if (!projectId || !mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: 'invalid projectId' });
    const userId = req.user.sub;
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (!project.members.some((m) => String(m) === String(userId))) {
      return res.status(403).json({ error: 'not a member of this project' });
    }
    const task = await Task.create({
      project: project._id,
      title: String(title).trim(),
      assignees: [{ user: userId, sharePct: 100 }],
      status: 'todo',
      createdBy: userId,
    });
    res.status(201).json({
      taskId: String(task._id),
      title: task.title,
      projectId: String(project._id),
      projectName: project.name,
      status: task.status,
      estimatedHours: 0,
    });
  }));

  router.post('/:weekStart/attachments', upload.single('file'), asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday' });
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    if (!doc) return res.status(404).json({ error: 'no timesheet found' });
    if ((doc.attachments || []).length >= 5) return res.status(400).json({ error: 'max 5 attachments' });
    const bucket = getBucket();
    const stream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { userId, weekStart },
    });
    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);
    readable.pipe(stream);
    await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
    const attachment = {
      fileId: stream.id, filename: req.file.originalname, contentType: req.file.mimetype,
      size: req.file.size, uploadedAt: new Date(),
    };
    doc.attachments.push(attachment);
    await doc.save();
    res.status(201).json({ fileId: String(attachment.fileId), filename: attachment.filename, contentType: attachment.contentType, size: attachment.size, uploadedAt: attachment.uploadedAt });
  }));

  router.delete('/:weekStart/attachments/:fileId', asyncHandler(async (req, res) => {
    const { weekStart, fileId } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday' });
    if (!mongoose.isValidObjectId(fileId)) return res.status(400).json({ error: 'invalid fileId' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    if (!doc) return res.status(404).json({ error: 'no timesheet found' });
    const idx = doc.attachments.findIndex((a) => String(a.fileId) === fileId);
    if (idx === -1) return res.status(404).json({ error: 'attachment not found' });
    const bucket = getBucket();
    await bucket.delete(new mongoose.Types.ObjectId(fileId));
    doc.attachments.splice(idx, 1);
    await doc.save();
    res.json({ ok: true });
  }));

  return router;
}
