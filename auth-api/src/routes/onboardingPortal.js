import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { OnboardingCase } from '../models/OnboardingCase.js';
import { Offer } from '../models/Offer.js';
import { OnboardingTask } from '../models/OnboardingTask.js';
import { DocumentRequest } from '../models/DocumentRequest.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getDocBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'onboardingDocs' });
}

async function resolveCase(req, res, next) {
  const c = await OnboardingCase.findByPortalToken(req.params.token);
  if (!c) return res.status(401).json({ error: 'invalid or expired token' });
  req.onboardingCase = c;
  next();
}

export function createOnboardingPortalRouter() {
  const router = express.Router();

  router.get('/:token/checklist', asyncHandler(resolveCase), asyncHandler(async (req, res) => {
    const c = req.onboardingCase;
    const offer = await Offer.findOne({ onboardingCase: c._id, status: { $ne: 'revised' } }).sort('-version');
    const tasks = await OnboardingTask.find({ onboardingCase: c._id, ownerRole: 'candidate' });
    const docs = await DocumentRequest.find({ onboardingCase: c._id });

    res.json({
      status: c.status,
      candidate: c.candidate,
      designation: c.designation,
      joiningDate: c.joiningDate,
      offer: offer ? { ctcAnnual: offer.ctcAnnual, status: offer.status, joiningDate: offer.joiningDate, expiryDate: offer.expiryDate } : null,
      tasks: tasks.map(t => ({ key: t.templateKey, title: t.title, status: t.status, dueDate: t.dueDate })),
      documents: docs.map(d => ({ _id: d._id, docType: d.docType, mandatory: d.mandatory, verifyStatus: d.verifyStatus, hasSubmission: !!d.submission?.fileId })),
    });
  }));

  router.post('/:token/accept-offer', asyncHandler(resolveCase), asyncHandler(async (req, res) => {
    const c = req.onboardingCase;
    if (!['OFFER_SENT'].includes(c.status)) return res.status(400).json({ error: 'offer not in sent state' });
    const offer = await Offer.findOne({ onboardingCase: c._id, status: 'sent' }).sort('-version');
    if (!offer) return res.status(400).json({ error: 'no sent offer' });
    offer.status = 'accepted';
    offer.respondedAt = new Date();
    offer.candidateSignature = { signedAt: new Date(), ip: req.ip || '' };
    await offer.save();
    c.status = 'OFFER_ACCEPTED';
    await c.save();
    res.json({ status: c.status, offer: { status: offer.status } });
  }));

  router.post('/:token/decline-offer', asyncHandler(resolveCase), asyncHandler(async (req, res) => {
    const c = req.onboardingCase;
    if (!['OFFER_SENT'].includes(c.status)) return res.status(400).json({ error: 'offer not in sent state' });
    const offer = await Offer.findOne({ onboardingCase: c._id, status: 'sent' }).sort('-version');
    if (!offer) return res.status(400).json({ error: 'no sent offer' });
    offer.status = 'declined';
    offer.respondedAt = new Date();
    offer.declineReason = req.body.reason || '';
    await offer.save();
    c.status = 'OFFER_DECLINED';
    await c.save();
    res.json({ status: c.status });
  }));

  router.post('/:token/profile', asyncHandler(resolveCase), asyncHandler(async (req, res) => {
    const c = req.onboardingCase;
    const allowed = ['phone', 'address', 'dateOfBirth', 'gender', 'bloodGroup',
                     'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation',
                     'bankName', 'bankAccount', 'ifsc', 'pan', 'aadhaar'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (['phone'].includes(key)) {
          c.candidate[key] = req.body[key];
        } else {
          updates[`candidateProfile.${key}`] = req.body[key];
        }
      }
    }
    if (req.body.phone) c.candidate.phone = req.body.phone;
    await c.save();
    if (Object.keys(updates).length) {
      await OnboardingCase.updateOne({ _id: c._id }, { $set: updates });
    }
    res.json({ ok: true });
  }));

  router.post('/:token/documents', asyncHandler(resolveCase), upload.single('file'), asyncHandler(async (req, res) => {
    const c = req.onboardingCase;
    const { docId } = req.body;
    const doc = await DocumentRequest.findOne({ _id: docId, onboardingCase: c._id });
    if (!doc) return res.status(404).json({ error: 'document request not found' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const bucket = getDocBucket();
    const stream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { onboardingCase: c._id.toString(), docType: doc.docType },
    });
    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);
    readable.pipe(stream);
    await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
    doc.submission = {
      fileId: stream.id,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    };
    doc.verifyStatus = 'submitted';
    await doc.save();
    res.json(doc);
  }));

  router.post('/:token/tasks/:key/complete', asyncHandler(resolveCase), asyncHandler(async (req, res) => {
    const c = req.onboardingCase;
    const task = await OnboardingTask.findOne({ onboardingCase: c._id, templateKey: req.params.key, ownerRole: 'candidate' });
    if (!task) return res.status(404).json({ error: 'task not found' });
    task.status = 'done';
    task.completedAt = new Date();
    await task.save();
    res.json(task);
  }));

  return router;
}
