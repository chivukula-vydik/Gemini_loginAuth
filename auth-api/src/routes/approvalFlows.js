import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { ApprovalFlow } from '../models/ApprovalFlow.js';
import { ApprovalRequest } from '../models/ApprovalRequest.js';
import { validateFlow, recordDecision } from '../services/approvalEngine.js';

export function createApprovalFlowsRouter() {
  const router = express.Router();

  // ── Admin: list all flows ─────────────────────────────────────────────
  router.get('/', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const flows = await ApprovalFlow.find().sort('priority').lean();
    res.json(flows);
  }));

  // ── Admin: get single flow ────────────────────────────────────────────
  router.get('/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const flow = await ApprovalFlow.findById(req.params.id).lean();
    if (!flow) return res.status(404).json({ error: 'not found' });
    res.json(flow);
  }));

  // ── Admin: create flow ────────────────────────────────────────────────
  router.post('/', requireAuth, requireRole('admin'), requireFeature('approval-flows', { write: true }), asyncHandler(async (req, res) => {
    const errors = validateFlow(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const flow = await ApprovalFlow.create({
      ...req.body,
      updatedBy: req.user.sub,
      updatedAt: new Date(),
    });
    res.status(201).json(flow);
  }));

  // ── Admin: update flow ────────────────────────────────────────────────
  router.put('/:id', requireAuth, requireRole('admin'), requireFeature('approval-flows', { write: true }), asyncHandler(async (req, res) => {
    const errors = validateFlow(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const flow = await ApprovalFlow.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user.sub, updatedAt: new Date() },
      { new: true },
    );
    if (!flow) return res.status(404).json({ error: 'not found' });
    res.json(flow);
  }));

  // ── Admin: toggle active ──────────────────────────────────────────────
  router.patch('/:id/toggle', requireAuth, requireRole('admin'), requireFeature('approval-flows', { write: true }), asyncHandler(async (req, res) => {
    const flow = await ApprovalFlow.findById(req.params.id);
    if (!flow) return res.status(404).json({ error: 'not found' });
    flow.active = !flow.active;
    flow.updatedBy = req.user.sub;
    flow.updatedAt = new Date();
    await flow.save();
    res.json(flow);
  }));

  // ── Admin: delete flow ────────────────────────────────────────────────
  router.delete('/:id', requireAuth, requireRole('admin'), requireFeature('approval-flows', { write: true }), asyncHandler(async (req, res) => {
    const pending = await ApprovalRequest.countDocuments({ flowId: req.params.id, status: 'pending' });
    if (pending > 0) return res.status(400).json({ error: `${pending} pending request(s) use this flow — cannot delete` });
    const flow = await ApprovalFlow.findByIdAndDelete(req.params.id);
    if (!flow) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  }));

  // ── Admin: duplicate flow ─────────────────────────────────────────────
  router.post('/:id/duplicate', requireAuth, requireRole('admin'), requireFeature('approval-flows', { write: true }), asyncHandler(async (req, res) => {
    const source = await ApprovalFlow.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ error: 'not found' });
    delete source._id;
    source.name = `${source.name} (copy)`;
    source.active = false;
    source.updatedBy = req.user.sub;
    source.updatedAt = new Date();
    const copy = await ApprovalFlow.create(source);
    res.status(201).json(copy);
  }));

  // ── Approval requests: my pending (what I need to act on) ─────────────
  router.get('/requests/my-pending', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.sub;
    const requests = await ApprovalRequest.find({ status: 'pending' })
      .populate('requestedBy', 'displayName email')
      .lean();
    // filter to requests where user is a resolved approver for the current step
    const actionable = requests.filter(r => {
      const approvers = r.resolvedApprovers instanceof Map
        ? r.resolvedApprovers.get(String(r.currentStep)) || []
        : (r.resolvedApprovers?.[String(r.currentStep)] || []);
      return approvers.some(a => a.toString() === userId);
    });
    res.json(actionable);
  }));

  // ── Approval requests: for entity ─────────────────────────────────────
  router.get('/requests/entity/:entityType/:entityId', requireAuth, asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params;
    const requests = await ApprovalRequest.find({ entityType, entityId })
      .populate('requestedBy', 'displayName email')
      .populate('decisions.approver', 'displayName email')
      .sort('-createdAt')
      .lean();
    res.json(requests);
  }));

  // ── Decide (approve/reject current step) ──────────────────────────────
  router.post('/requests/:id/decide', requireAuth, asyncHandler(async (req, res) => {
    const { decision, comment } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }
    if (decision === 'reject' && !comment?.trim()) {
      return res.status(400).json({ error: 'rejection reason required' });
    }
    try {
      const updated = await recordDecision(req.params.id, req.user.sub, decision, comment);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }));

  return router;
}
