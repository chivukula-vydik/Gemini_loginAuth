import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Reimbursement } from '../models/Reimbursement.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'reimbursementFiles' });
}

export function createReimbursementsRouter() {
  const router = express.Router();

  router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { category, amount, claimDate, description } = req.body;
    if (!category || !amount || !claimDate) {
      return res.status(400).json({ error: 'category, amount, and claimDate required' });
    }
    const claim = await Reimbursement.create({ user: req.user.sub, category, amount, claimDate, description });
    res.status(201).json(claim);
  }));

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const claims = await Reimbursement.find({ user: req.user.sub }).sort('-createdAt');
    res.json(claims);
  }));

  router.get('/pending', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claims = await Reimbursement.find({ status: 'submitted' })
      .populate('user', 'displayName email employeeCode')
      .sort('-createdAt');
    res.json(claims);
  }));

  router.post('/:id/approve', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    claim.status = 'approved';
    claim.approver = req.user.sub;
    claim.approvedAt = new Date();
    await claim.save();
    res.json(claim);
  }));

  router.post('/:id/reject', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    if (!req.body.reason) return res.status(400).json({ error: 'rejection reason required' });
    claim.status = 'rejected';
    claim.approver = req.user.sub;
    claim.rejectionReason = req.body.reason;
    await claim.save();
    res.json(claim);
  }));

  router.post('/:id/attachments', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
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

  router.delete('/:id/attachments/:fileId', requireAuth, asyncHandler(async (req, res) => {
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
