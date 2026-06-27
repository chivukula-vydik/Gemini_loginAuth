import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Leave, LEAVE_TYPES, HALF_DAY_OPTIONS, enumerateDays, workingDays, requestedDaysFor } from '../models/Leave.js';
import { Attendance } from '../models/Attendance.js';
import { getOrCreateBalance, remaining, QUOTA_LEAVE_TYPES } from '../models/LeaveBalance.js';
import { User } from '../models/User.js';
import { sendLeaveDecision, sendLeaveRequest } from '../services/mailer.js';
import { isRmGateActive } from '../middleware/requireScope.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createLeaveRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /leave/balance — the caller's quota usage for the current year
  router.get('/balance', asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const balance = await getOrCreateBalance(req.user.sub, year);
    const shape = (type) => ({ total: balance[type].total, used: balance[type].used, remaining: remaining(balance, type) });
    res.json({ year, casual: shape('casual'), sick: shape('sick'), earned: shape('earned') });
  }));

  // POST /leave — employee submits a leave request
  router.post('/', asyncHandler(async (req, res) => {
    const { type, startDate, endDate, reason, halfDay } = req.body;
    if (!LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'invalid leave type' });
    if (!DATE_RE.test(startDate || '') || !DATE_RE.test(endDate || '')) {
      return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD' });
    }
    if (endDate < startDate) return res.status(400).json({ error: 'endDate is before startDate' });

    const halfDayValue = halfDay || 'none';
    if (!HALF_DAY_OPTIONS.includes(halfDayValue)) return res.status(400).json({ error: 'invalid halfDay value' });
    if (halfDayValue !== 'none' && startDate !== endDate) {
      return res.status(400).json({ error: 'half-day leave must be a single day' });
    }

    const requestedDays = requestedDaysFor(startDate, endDate, halfDayValue);

    if (QUOTA_LEAVE_TYPES.includes(type)) {
      const year = Number(startDate.slice(0, 4));
      const balance = await getOrCreateBalance(req.user.sub, year);
      if (requestedDays > remaining(balance, type)) {
        return res.status(400).json({ error: `insufficient ${type} leave balance` });
      }
    }

    const requester = await User.findById(req.user.sub).select('reportingManagerId');
    const assignedApprover = requester?.reportingManagerId || null;

    const doc = await Leave.create({
      userId: req.user.sub,
      type, startDate, endDate,
      halfDay: halfDayValue,
      requestedDays,
      reason: String(reason || ''),
      assignedApprover,
    });

    if (assignedApprover) {
      const manager = await User.findById(assignedApprover).select('email');
      const employee = await User.findById(req.user.sub).select('displayName');
      if (manager?.email) {
        sendLeaveRequest(manager.email, {
          employeeName: employee?.displayName || 'An employee',
          type, startDate, endDate,
        }).catch((e) => console.error('[mailer] sendLeaveRequest error:', e.message));
      }
    }

    res.status(201).json(doc);
  }));

  // DELETE /leave/:id — cancel a pending request (just delete) or an approved
  // future leave (refund balance + clean up attendance records).
  router.delete('/:id', asyncHandler(async (req, res) => {
    const doc = await Leave.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (String(doc.userId) !== req.user.sub) return res.status(403).json({ error: 'forbidden' });

    const today = new Date().toISOString().slice(0, 10);

    if (doc.status === 'pending') {
      await doc.deleteOne();
      return res.json({ ok: true });
    }

    if (doc.status === 'approved' && doc.startDate > today) {
      if (QUOTA_LEAVE_TYPES.includes(doc.type)) {
        const year = Number(doc.startDate.slice(0, 4));
        const balance = await getOrCreateBalance(doc.userId, year);
        balance[doc.type].used = Math.max(0, balance[doc.type].used - (doc.requestedDays || 0));
        await balance.save();
      }
      const days = enumerateDays(doc.startDate, doc.endDate)
        .filter((s) => { const dow = new Date(s + 'T00:00:00').getDay(); return dow !== 0 && dow !== 6; });
      for (const date of days) {
        const att = await Attendance.findOne({ userId: doc.userId, date });
        if (att && att.status === 'leave' && !att.checkIn) {
          await att.deleteOne();
        }
      }
      doc.status = 'cancelled';
      doc.decidedAt = new Date();
      await doc.save();
      return res.json({ ok: true });
    }

    return res.status(409).json({ error: 'leave cannot be cancelled after it has started or been rejected' });
  }));

  // GET /leave/mine — the caller's own requests, newest first
  router.get('/mine', asyncHandler(async (req, res) => {
    const docs = await Leave.find({ userId: req.user.sub }).sort({ requestedAt: -1 });
    res.json(docs.map((d) => ({ ...d.toObject(), days: d.requestedDays || workingDays(d.startDate, d.endDate) })));
  }));

  // GET /leave/pending — approval review queue
  router.get('/pending', requireRole('admin', 'reporting_manager', 'team_lead', 'hr'), asyncHandler(async (req, res) => {
    let filter = { status: 'pending' };
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (roles.includes('reporting_manager') || roles.includes('team_lead')) {
      filter.assignedApprover = req.user.sub;
    }
    // admin and hr see all pending — no extra filter
    const docs = await Leave.find(filter)
      .populate('userId', 'displayName email')
      .sort({ requestedAt: -1 });
    res.json(docs.map((d) => ({ ...d.toObject(), days: d.requestedDays || workingDays(d.startDate, d.endDate) })));
  }));

  // PATCH /leave/:id/decide — approves or rejects
  router.patch('/:id/decide', requireRole('admin', 'reporting_manager', 'team_lead', 'hr'), asyncHandler(async (req, res) => {
    const { decision } = req.body;   // "approved" | "rejected"
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'invalid decision' });
    }

    const doc = await Leave.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.status !== 'pending') return res.status(409).json({ error: 'already decided' });

    const roles = req.user.roles || [req.user.role];
    if ((roles.includes('reporting_manager') || roles.includes('team_lead')) && String(doc.assignedApprover) !== req.user.sub) {
      return res.status(404).json({ error: 'not found' });
    }
    if (roles.includes('hr') && !roles.includes('admin')) {
      const requesterUser = await User.findById(doc.userId).select('reportingManagerId');
      const gateActive = await isRmGateActive(requesterUser?.reportingManagerId);
      if (!gateActive) {
        return res.status(403).json({ error: 'RM is active — HR approval not available' });
      }
    }

    doc.status = decision;
    doc.decidedBy = req.user.sub;
    doc.decidedAt = new Date();
    await doc.save();

    const requester = await User.findById(doc.userId).select('email');
    if (requester?.email) {
      sendLeaveDecision(requester.email, {
        type: doc.type, startDate: doc.startDate, endDate: doc.endDate, decision,
      }).catch((e) => console.error('[mailer] sendLeaveDecision error:', e.message));
    }

    if (decision === 'approved') {
      // Charge the balance now that the request is confirmed (quota types only).
      if (QUOTA_LEAVE_TYPES.includes(doc.type)) {
        const year = Number(doc.startDate.slice(0, 4));
        const balance = await getOrCreateBalance(doc.userId, year);
        balance[doc.type].used += doc.requestedDays || 0;
        await balance.save();
      }

      // Mark each weekday in the range as leave in attendance so it shows a
      // LEAVE badge and is never treated as missed/absent. Weekends are left
      // alone (they're already "day off"). Days that already have a check-in
      // are not overwritten.
      const note = doc.halfDay && doc.halfDay !== 'none'
        ? `${doc.type} leave (half day, ${doc.halfDay === 'first' ? 'morning' : 'afternoon'})`
        : `${doc.type} leave`;
      const days = enumerateDays(doc.startDate, doc.endDate)
        .filter((s) => { const dow = new Date(s + 'T00:00:00').getDay(); return dow !== 0 && dow !== 6; });
      for (const date of days) {
        const existing = await Attendance.findOne({ userId: doc.userId, date });
        if (existing) {
          // Don't clobber a day the person actually worked — clock-in is the
          // source of truth. Flag the mismatch on the doc so a PM reviewing
          // attendance can see leave was approved for a day the person
          // worked anyway, instead of silently dropping the conflict.
          if (!existing.checkIn) {
            existing.status = 'leave';
            existing.note = note;
            await existing.save();
          } else {
            existing.note = `${existing.note ? existing.note + ' | ' : ''}conflict: ${note} approved but already clocked in`;
            await existing.save();
          }
        } else {
          await Attendance.create({ userId: doc.userId, date, status: 'leave', note });
        }
      }
    }

    res.json(doc);
  }));

  return router;
}
