import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { Reimbursement } from '../models/Reimbursement.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { ApprovalRequest } from '../models/ApprovalRequest.js';
import { selectFlow, createApprovalRequest, recordDecision } from '../services/approvalEngine.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'reimbursementFiles' });
}

/** Map engine status back to Reimbursement status */
function syncReimbursementStatus(approvalReq, claim) {
  if (approvalReq.status === 'rejected') {
    claim.status = 'rejected';
    const lastReject = [...approvalReq.decisions].reverse().find(d => d.decision === 'reject');
    if (lastReject?.comment) claim.rejectionReason = lastReject.comment;
  } else if (approvalReq.status === 'approved') {
    claim.status = 'approved';
  } else {
    // still pending — map step to legacy status for backward compat
    const step = approvalReq.currentStep;
    const stepDef = approvalReq.snapshot.find(s => s.order === step);
    if (stepDef?.name?.toLowerCase().includes('finance')) claim.status = 'pm_approved';
    else if (step === 1) claim.status = 'submitted';
    else claim.status = 'rm_approved';
  }
}

export function createReimbursementsRouter() {
  const router = express.Router();

  // ── Employee: submit claim ─────────────────────────────────────────────
  router.post('/', requireAuth, requireFeature('reimbursements', { write: true }), asyncHandler(async (req, res) => {
    const { category, amount, claimDate, description, project } = req.body;
    if (!category || !amount || !claimDate) {
      return res.status(400).json({ error: 'category, amount, and claimDate required' });
    }
    if (project) {
      const proj = await Project.findById(project);
      if (!proj) return res.status(400).json({ error: 'project not found' });
      if (!proj.members.map(String).includes(req.user.sub) && String(proj.ownerPm) !== req.user.sub) {
        return res.status(400).json({ error: 'you are not a member of this project' });
      }
    }
    const claim = await Reimbursement.create({
      user: req.user.sub, category, amount, claimDate, description,
      project: project || null,
    });

    // Create approval request via engine
    const flow = await selectFlow('reimbursement', { amount, category, project: project || null });
    if (flow) {
      try {
        const ar = await createApprovalRequest(flow._id, 'reimbursement', claim._id, req.user.sub, { amount, category });
        claim.approvalRequestId = ar._id;
        await claim.save();
      } catch (e) {
        // ponytail: if engine fails (e.g. no manager), claim is still created as submitted — fallback is no worse than before
        console.error('[approval-engine] reimbursement flow error:', e.message);
      }
    }

    res.status(201).json(claim);
  }));

  // ── Employee: my claims ────────────────────────────────────────────────
  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const claims = await Reimbursement.find({ user: req.user.sub })
      .populate('project', 'name')
      .sort('-createdAt');
    res.json(claims);
  }));

  // ── Pending claims by queue (rm / pm / finance) ────────────────────────
  // Reads from ApprovalRequest to determine who can act on what step.
  router.get('/pending/:queue', requireAuth, asyncHandler(async (req, res) => {
    const { queue } = req.params;
    const userId = req.user.sub;

    // Find all pending reimbursement approval requests
    const pendingARs = await ApprovalRequest.find({
      entityType: 'reimbursement',
      status: 'pending',
    }).lean();

    // Filter to requests where this user is in resolvedApprovers for the current step
    const myARs = pendingARs.filter(ar => {
      const approvers = ar.resolvedApprovers instanceof Map
        ? ar.resolvedApprovers.get(String(ar.currentStep)) || []
        : (ar.resolvedApprovers?.[String(ar.currentStep)] || []);
      return approvers.some(a => a.toString() === userId);
    });

    // Further filter by queue for backward compat
    const filtered = myARs.filter(ar => {
      const step = ar.snapshot.find(s => s.order === ar.currentStep);
      if (!step) return false;
      if (queue === 'rm') return step.approverType === 'manager' || step.name.toLowerCase().includes('manager');
      if (queue === 'pm') return step.approverType === 'role' && step.name.toLowerCase().includes('pm');
      if (queue === 'finance') return step.name.toLowerCase().includes('finance');
      return true;
    });

    const entityIds = filtered.map(ar => ar.entityId);
    const claims = await Reimbursement.find({ _id: { $in: entityIds } })
      .populate('user', 'displayName email employeeCode')
      .populate('project', 'name')
      .sort('-createdAt');
    res.json(claims);
  }));

  // ── Legacy: all pending (for backward compat) ──────────────────────────
  router.get('/pending', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.sub;
    const pendingARs = await ApprovalRequest.find({
      entityType: 'reimbursement',
      status: 'pending',
    }).lean();

    const myARs = pendingARs.filter(ar => {
      const approvers = ar.resolvedApprovers instanceof Map
        ? ar.resolvedApprovers.get(String(ar.currentStep)) || []
        : (ar.resolvedApprovers?.[String(ar.currentStep)] || []);
      return approvers.some(a => a.toString() === userId);
    });

    const entityIds = myARs.map(ar => ar.entityId);
    const claims = await Reimbursement.find({ _id: { $in: entityIds } })
      .populate('user', 'displayName email employeeCode')
      .populate('project', 'name')
      .sort('-createdAt');
    res.json(claims);
  }));

  // ── Approve ────────────────────────────────────────────────────────────
  router.post('/:id/approve', requireAuth, requireFeature('reimbursements', { write: true }), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (['approved', 'paid', 'rejected'].includes(claim.status)) {
      return res.status(400).json({ error: `claim is already ${claim.status}` });
    }

    if (claim.approvalRequestId) {
      try {
        const ar = await recordDecision(claim.approvalRequestId, req.user.sub, 'approve', '');
        syncReimbursementStatus(ar, claim);
        // record in legacy trail for backward compat
        const step = ar.snapshot.find(s => s.order === ar.currentStep) || ar.snapshot[ar.snapshot.length - 1];
        const trailRole = step?.name?.toLowerCase().includes('finance') ? 'finance'
          : step?.name?.toLowerCase().includes('pm') ? 'pm' : 'rm';
        claim.approvalTrail.push({ role: trailRole, user: req.user.sub, action: 'approved' });
        await claim.save();
        return res.json(claim);
      } catch (e) {
        return res.status(403).json({ error: e.message });
      }
    }

    // Fallback for claims created before engine was wired (no approvalRequestId)
    return res.status(400).json({ error: 'claim has no approval flow — created before engine was active' });
  }));

  // ── Reject ─────────────────────────────────────────────────────────────
  router.post('/:id/reject', requireAuth, requireFeature('reimbursements', { write: true }), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (['approved', 'paid', 'rejected'].includes(claim.status)) {
      return res.status(400).json({ error: `claim is already ${claim.status}` });
    }
    if (!req.body.reason) return res.status(400).json({ error: 'rejection reason required' });

    if (claim.approvalRequestId) {
      try {
        const ar = await recordDecision(claim.approvalRequestId, req.user.sub, 'reject', req.body.reason);
        syncReimbursementStatus(ar, claim);
        const step = ar.snapshot.find(s => s.order === ar.currentStep) || ar.snapshot[ar.snapshot.length - 1];
        const trailRole = step?.name?.toLowerCase().includes('finance') ? 'finance'
          : step?.name?.toLowerCase().includes('pm') ? 'pm' : 'rm';
        claim.approvalTrail.push({ role: trailRole, user: req.user.sub, action: 'rejected', reason: req.body.reason });
        await claim.save();
        return res.json(claim);
      } catch (e) {
        return res.status(403).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: 'claim has no approval flow — created before engine was active' });
  }));

  // ── File upload ────────────────────────────────────────────────────────
  router.post('/:id/attachments', requireAuth, requireFeature('reimbursements', { write: true }), upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (String(claim.user) !== req.user.sub) return res.status(403).json({ error: 'not your claim' });
    if ((claim.attachments || []).length >= 5) return res.status(400).json({ error: 'max 5 attachments' });
    const bucket = getBucket();
    const stream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { userId: req.user.sub, claimId: req.params.id },
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
    claim.attachments.push(attachment);
    await claim.save();
    res.status(201).json({ fileId: String(attachment.fileId), filename: attachment.filename, contentType: attachment.contentType, size: attachment.size, uploadedAt: attachment.uploadedAt });
  }));

  // ── File download ──────────────────────────────────────────────────────
  router.get('/attachments/:fileId', requireAuth, asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) return res.status(400).json({ error: 'invalid fileId' });
    const oid = new mongoose.Types.ObjectId(fileId);
    const bucket = getBucket();
    const files = await bucket.find({ _id: oid }).toArray();
    if (!files.length) return res.status(404).json({ error: 'file not found' });
    res.set('Content-Type', files[0].contentType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${files[0].filename}"`);
    bucket.openDownloadStream(oid).pipe(res);
  }));

  // ── Delete attachment ──────────────────────────────────────────────────
  router.delete('/:id/attachments/:fileId', requireAuth, requireFeature('reimbursements', { write: true }), asyncHandler(async (req, res) => {
    const { id, fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) return res.status(400).json({ error: 'invalid fileId' });
    const claim = await Reimbursement.findById(id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (String(claim.user) !== req.user.sub) return res.status(403).json({ error: 'not your claim' });
    const idx = claim.attachments.findIndex(a => String(a.fileId) === fileId);
    if (idx === -1) return res.status(404).json({ error: 'attachment not found' });
    const bucket = getBucket();
    await bucket.delete(new mongoose.Types.ObjectId(fileId));
    claim.attachments.splice(idx, 1);
    await claim.save();
    res.json({ ok: true });
  }));

  return router;
}
