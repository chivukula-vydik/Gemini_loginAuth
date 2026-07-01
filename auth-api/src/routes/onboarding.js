import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { OnboardingCase, VALID_TRANSITIONS, TERMINAL_STATES } from '../models/OnboardingCase.js';
import { Offer } from '../models/Offer.js';
import { OnboardingTemplate } from '../models/OnboardingTemplate.js';
import { OnboardingTask } from '../models/OnboardingTask.js';
import { DocumentRequest } from '../models/DocumentRequest.js';
import { User } from '../models/User.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { PayGroup } from '../models/PayGroup.js';
import { LeaveBalance, DEFAULT_QUOTAS } from '../models/LeaveBalance.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { InvestmentDeclaration } from '../models/InvestmentDeclaration.js';
import crypto from 'crypto';
import { sendOfferEmail } from '../services/mailer.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getDocBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'onboardingDocs' });
}

export function createOnboardingRouter() {
  const router = express.Router();

  // --- Static-prefix routes (registered before /:id to avoid shadowing) ---

  router.post('/tasks/:taskId/complete', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const task = await OnboardingTask.findById(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (task.assignedTo && task.assignedTo.toString() !== req.user.sub && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'not assigned to you' });
    }
    task.status = 'done';
    task.completedAt = new Date();
    task.completedBy = req.user.sub;
    await task.save();
    res.json(task);
  }));

  router.get('/tasks/mine', requireAuth, requireFeature('onboarding'), asyncHandler(async (req, res) => {
    const tasks = await OnboardingTask.find({ assignedTo: req.user.sub })
      .populate({ path: 'onboardingCase', select: 'candidate designation status joiningDate' })
      .sort({ phase: 1, dueDate: 1 });
    res.json(tasks);
  }));

  router.post('/documents/:docId/verify', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const doc = await DocumentRequest.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.verifyStatus !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    doc.verifyStatus = 'verified';
    doc.verifiedBy = req.user.sub;
    doc.verifiedAt = new Date();
    if (req.body.extractedFields) doc.submission.extractedFields = req.body.extractedFields;
    await doc.save();
    res.json(doc);
  }));

  router.post('/documents/:docId/reject', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const doc = await DocumentRequest.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.verifyStatus !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    doc.verifyStatus = 'rejected';
    doc.rejectionReason = req.body.reason || '';
    await doc.save();
    res.json(doc);
  }));

  router.get('/documents/:fileId/download', requireAuth, requireFeature('onboarding'), asyncHandler(async (req, res) => {
    const bucket = getDocBucket();
    const oid = new mongoose.Types.ObjectId(req.params.fileId);
    const files = await bucket.find({ _id: oid }).toArray();
    if (!files.length) return res.status(404).json({ error: 'file not found' });
    res.set('Content-Type', files[0].contentType);
    res.set('Content-Disposition', `inline; filename="${files[0].filename}"`);
    bucket.openDownloadStream(oid).pipe(res);
  }));

  router.get('/templates', requireAuth, requireFeature('onboarding-templates'), asyncHandler(async (req, res) => {
    const templates = await OnboardingTemplate.find({ archived: { $ne: true } }).sort('-createdAt');
    res.json(templates);
  }));

  router.post('/templates', requireAuth, requireFeature('onboarding-templates', { write: true }), asyncHandler(async (req, res) => {
    const { name, description, icon, appliesTo, tasks } = req.body;
    if (!name || !tasks?.length) return res.status(400).json({ error: 'name and tasks required' });
    const template = await OnboardingTemplate.create({ name, description, icon, appliesTo, tasks, createdBy: req.user.sub });
    res.status(201).json(template);
  }));

  router.delete('/templates/:id', requireAuth, requireFeature('onboarding-templates', { write: true }), asyncHandler(async (req, res) => {
    const template = await OnboardingTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'not found' });
    template.archived = true;
    await template.save();
    res.json({ ok: true });
  }));

  router.put('/templates/:id', requireAuth, requireFeature('onboarding-templates', { write: true }), asyncHandler(async (req, res) => {
    const template = await OnboardingTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!template) return res.status(404).json({ error: 'not found' });
    res.json(template);
  }));

  // --- Cases ---

  router.post('/', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const { candidate, designation, department, reportingManager, payGrade, payGroup,
            workLocation, employmentType, joiningDate, probationMonths, workflowTemplate } = req.body;
    if (!candidate?.firstName || !candidate?.lastName || !candidate?.personalEmail || !joiningDate) {
      return res.status(400).json({ error: 'candidate (firstName, lastName, personalEmail) and joiningDate required' });
    }
    const c = await OnboardingCase.create({
      candidate, designation, department, reportingManager, payGrade, payGroup,
      workLocation, employmentType, joiningDate, probationMonths, workflowTemplate,
      createdBy: req.user.sub,
    });
    res.status(201).json(c);
  }));

  router.get('/', requireAuth, requireFeature('onboarding'), asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;
    if (!req.user.roles.includes('admin') && !req.user.roles.includes('hr')) {
      filter.reportingManager = req.user.sub;
    }
    const cases = await OnboardingCase.find(filter)
      .populate('department', 'name')
      .populate('reportingManager', 'displayName email')
      .sort('-createdAt');

    const caseIds = cases.map(c => c._id);
    const progressAgg = await OnboardingTask.aggregate([
      { $match: { onboardingCase: { $in: caseIds } } },
      { $group: {
        _id: '$onboardingCase',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
      }},
    ]);
    const progressMap = new Map(progressAgg.map(p => [String(p._id), { done: p.done, total: p.total }]));

    const result = cases.map(c => ({
      ...c.toObject(),
      taskProgress: progressMap.get(String(c._id)) || { done: 0, total: 0 },
    }));

    res.json(result);
  }));

  router.get('/stats', requireAuth, requireFeature('onboarding'), asyncHandler(async (req, res) => {
    const now = new Date();
    const sevenDays = new Date(now);
    sevenDays.setDate(sevenDays.getDate() + 7);

    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);

    const terminalStatuses = ['OFFER_DECLINED', 'CANCELLED', 'TERMINATED', 'CONFIRMED'];

    const [activeCases, joiningSoon, completedThisQuarter, overdueResult] = await Promise.all([
      OnboardingCase.countDocuments({ status: { $nin: terminalStatuses } }),
      OnboardingCase.countDocuments({
        status: { $nin: terminalStatuses },
        joiningDate: { $gte: now, $lte: sevenDays },
      }),
      OnboardingCase.countDocuments({
        status: 'CONFIRMED',
        confirmedAt: { $gte: quarterStart },
      }),
      OnboardingTask.countDocuments({
        status: { $in: ['pending', 'in_progress'] },
        dueDate: { $lt: now, $ne: null },
      }),
    ]);

    res.json({ activeCases, joiningSoon, overdueTasks: overdueResult, completedThisQuarter });
  }));

  router.get('/:id', requireAuth, requireFeature('onboarding'), asyncHandler(async (req, res) => {
    const c = await OnboardingCase.findById(req.params.id)
      .populate('department', 'name')
      .populate('reportingManager', 'displayName email')
      .populate('payGrade', 'code label')
      .populate('payGroup', 'name');
    if (!c) return res.status(404).json({ error: 'not found' });
    const offer = await Offer.findOne({ onboardingCase: c._id, status: { $ne: 'revised' } }).sort('-version');
    const tasks = await OnboardingTask.find({ onboardingCase: c._id }).populate('assignedTo', 'displayName email').sort('dueDate');
    const docs = await DocumentRequest.find({ onboardingCase: c._id });

    const doneTasks = new Set(tasks.filter(t => t.status === 'done').map(t => t.templateKey));
    const enrichedTasks = tasks.map(t => {
      const blocked = t.dependsOn.length > 0 && !t.dependsOn.every(dep => doneTasks.has(dep));
      return { ...t.toObject(), blocked };
    });

    const mandatoryDocs = docs.filter(d => d.mandatory);
    const allMandatoryDocsVerified = mandatoryDocs.length > 0 && mandatoryDocs.every(d => d.verifyStatus === 'verified');
    const candidateGateTasks = tasks.filter(t => t.mandatory && t.runsOn === 'candidate');
    const allCandidateTasksDone = candidateGateTasks.every(t => t.status === 'done');
    const readyToConvert = allMandatoryDocsVerified && allCandidateTasksDone && offer?.status === 'accepted';

    res.json({ ...c.toObject(), offer, tasks: enrichedTasks, documents: docs, readyToConvert });
  }));

  // --- Transitions ---

  router.post('/:id/transition', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const { to } = req.body;
    const c = await OnboardingCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (TERMINAL_STATES.has(c.status)) return res.status(400).json({ error: 'case is in terminal state' });
    const allowed = VALID_TRANSITIONS[c.status] || [];
    if (!allowed.includes(to)) {
      return res.status(400).json({ error: `cannot transition from ${c.status} to ${to}`, allowed });
    }
    if (to === 'PRE_BOARDING') {
      await instantiateTasks(c);
      await createDefaultDocRequests(c);
    }
    c.status = to;
    await c.save();
    res.json(c);
  }));

  // --- Offers ---

  router.post('/:id/offer', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const c = await OnboardingCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const { ctcAnnual, componentsPreview, expiryDate, letterUrl } = req.body;
    const existing = await Offer.findOne({ onboardingCase: c._id, status: { $ne: 'revised' } }).sort('-version');
    if (existing) {
      existing.status = 'revised';
      await existing.save();
    }
    const version = existing ? existing.version + 1 : 1;
    const offer = await Offer.create({
      onboardingCase: c._id, version, ctcAnnual,
      componentsPreview: componentsPreview || [],
      joiningDate: c.joiningDate, expiryDate, letterUrl,
    });
    res.status(201).json(offer);
  }));

  router.post('/:id/offer/send', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const c = await OnboardingCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const offer = await Offer.findOne({ onboardingCase: c._id, status: 'draft' }).sort('-version');
    if (!offer) return res.status(400).json({ error: 'no draft offer to send' });
    offer.status = 'sent';
    offer.sentAt = new Date();
    await offer.save();
    const token = c.generatePortalToken();
    await c.save();
    if (c.status === 'DRAFT') {
      c.status = 'OFFER_SENT';
      await c.save();
    }
    const portalLink = `${process.env.WEB_URL || 'http://localhost:5173'}/onboarding/portal/${token}`;
    sendOfferEmail(c.candidate.personalEmail, {
      candidateName: `${c.candidate.firstName} ${c.candidate.lastName}`,
      designation: c.designation,
      ctcAnnual: offer.ctcAnnual,
      joiningDate: c.joiningDate,
      portalLink,
    }).catch(err => console.error('[mailer] offer email failed:', err));
    res.json({ offer, portalLink: `/onboarding/portal/${token}` });
  }));

  // --- Tasks ---

  router.get('/:id/tasks', requireAuth, requireFeature('onboarding'), asyncHandler(async (req, res) => {
    const tasks = await OnboardingTask.find({ onboardingCase: req.params.id })
      .populate('assignedTo', 'displayName email').sort('dueDate');
    const doneKeys = new Set(tasks.filter(t => t.status === 'done').map(t => t.templateKey));
    const enriched = tasks.map(t => ({
      ...t.toObject(),
      blocked: t.dependsOn.length > 0 && !t.dependsOn.every(dep => doneKeys.has(dep)),
    }));
    res.json(enriched);
  }));

  // --- Documents ---

  router.get('/:id/documents', requireAuth, requireFeature('onboarding'), asyncHandler(async (req, res) => {
    const docs = await DocumentRequest.find({ onboardingCase: req.params.id });
    res.json(docs);
  }));

  router.post('/:id/documents', requireAuth, requireFeature('onboarding', { write: true }), upload.single('file'), asyncHandler(async (req, res) => {
    const { docId } = req.body;
    const doc = await DocumentRequest.findById(docId);
    if (!doc) return res.status(404).json({ error: 'document request not found' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const bucket = getDocBucket();
    const stream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { onboardingCase: req.params.id, docType: doc.docType },
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

  // --- Conversion ---

  router.post('/:id/convert', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const c = await OnboardingCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (c.status !== 'JOINED') return res.status(400).json({ error: 'case must be in JOINED state' });
    if (c.convertedUser) return res.status(400).json({ error: 'already converted' });

    const offer = await Offer.findOne({ onboardingCase: c._id, status: 'accepted' }).sort('-version');
    if (!offer) return res.status(400).json({ error: 'no accepted offer' });

    const mandatoryDocs = await DocumentRequest.find({ onboardingCase: c._id, mandatory: true });
    const unverified = mandatoryDocs.filter(d => d.verifyStatus !== 'verified');
    if (unverified.length) {
      return res.status(400).json({ error: 'mandatory docs not verified', unverified: unverified.map(d => d.docType) });
    }

    const candidateTasks = await OnboardingTask.find({ onboardingCase: c._id, runsOn: 'candidate', mandatory: true });
    const incompleteCandidateTasks = candidateTasks.filter(t => t.status !== 'done');
    if (incompleteCandidateTasks.length) {
      return res.status(400).json({ error: 'mandatory candidate tasks not complete', tasks: incompleteCandidateTasks.map(t => t.title) });
    }

    const joiningStr = c.joiningDate.toISOString().slice(0, 10);
    const probEnd = new Date(c.joiningDate);
    probEnd.setMonth(probEnd.getMonth() + (c.probationMonths || 3));

    const profile = c.candidateProfile || {};
    const empType = c.employmentType === 'full_time' ? 'full-time' : c.employmentType;

    const profileFields = {
      dateOfBirth: profile.dateOfBirth || null,
      gender: profile.gender || '',
      bloodGroup: profile.bloodGroup || '',
      emergencyContactName: profile.emergencyContactName || '',
      emergencyContactPhone: profile.emergencyContactPhone || '',
      emergencyContactRelation: profile.emergencyContactRelation || '',
      pan: profile.pan || '',
      aadhaar: profile.aadhaar || '',
      bankName: profile.bankName || '',
      bankAccount: profile.bankAccount || '',
      ifsc: profile.ifsc || '',
    };

    let user = await User.findOne({ email: c.candidate.personalEmail });
    if (user) {
      await User.updateOne({ _id: user._id }, { $set: {
        active: true,
        departmentId: c.department,
        reportingManagerId: c.reportingManager,
        payGrade: c.payGrade,
        payGroup: c.payGroup,
        dateOfJoining: c.joiningDate,
        employmentType: empType,
        probationEndDate: probEnd,
        ...profileFields,
      }});
      if (!user.roles.includes('employee')) {
        await User.updateOne({ _id: user._id }, { $addToSet: { roles: 'employee' } });
      }
      user = await User.findById(user._id);
    } else {
      user = await User.create({
        email: c.candidate.personalEmail,
        displayName: `${c.candidate.firstName} ${c.candidate.lastName}`,
        roles: ['employee'],
        active: true,
        departmentId: c.department,
        reportingManagerId: c.reportingManager,
        payGrade: c.payGrade,
        payGroup: c.payGroup,
        dateOfJoining: c.joiningDate,
        employmentType: empType,
        probationEndDate: probEnd,
        phone: c.candidate.phone || '',
        ...profileFields,
      });
    }

    await SalaryStructure.create({
      user: user._id,
      ctcAnnual: offer.ctcAnnual,
      components: offer.componentsPreview,
      effectiveFrom: joiningStr,
    });

    if (c.payGroup) {
      await PayGroup.updateOne({ _id: c.payGroup }, { $addToSet: { members: user._id } });
    }

    const joiningYear = c.joiningDate.getFullYear();
    const joiningMonth = c.joiningDate.getMonth();
    const remainingMonths = 12 - joiningMonth;
    const existingBalance = await LeaveBalance.findOne({ userId: user._id, year: joiningYear });
    if (!existingBalance) {
      await LeaveBalance.create({
        userId: user._id,
        year: joiningYear,
        casual: { total: Math.round(DEFAULT_QUOTAS.casual * remainingMonths / 12), used: 0 },
        sick:   { total: Math.round(DEFAULT_QUOTAS.sick * remainingMonths / 12), used: 0 },
        earned: { total: Math.round(DEFAULT_QUOTAS.earned * remainingMonths / 12), used: 0 },
      });
    }

    await reassignTasksOnConvert(c, user._id);

    const joiningFY = joiningMonth < 3
      ? `FY${joiningYear - 1}-${String(joiningYear).slice(2)}`
      : `FY${joiningYear}-${String(joiningYear + 1).slice(2)}`;
    const existingDec = await InvestmentDeclaration.findOne({ user: user._id, financialYear: joiningFY });
    if (!existingDec) {
      await InvestmentDeclaration.create({
        user: user._id,
        financialYear: joiningFY,
        regime: 'new',
        items: [],
      });
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 72);
    await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt: tokenExpiry });

    c.convertedUser = user._id;
    c.status = 'INDUCTION';
    await c.save();

    const { sendWelcomeEmail } = await import('../services/mailer.js');
    const resetLink = `${process.env.WEB_URL || 'http://localhost:5173'}/auth/local/reset-password?token=${rawToken}`;
    sendWelcomeEmail(user.email, {
      name: user.displayName,
      resetLink,
    }).catch(() => {});

    res.json({
      case: c,
      user,
      passwordSetLink: resetLink,
      setup: {
        userCreated: true,
        salaryStructure: true,
        payGroup: !!c.payGroup,
        leaveBalance: true,
        declaration: joiningFY,
        profileCopied: Object.values(profileFields).some(v => v),
        welcomeEmailSent: true,
      },
    });
  }));

  // --- Confirmation ---

  router.post('/:id/confirm', requireAuth, requireFeature('onboarding', { write: true }), asyncHandler(async (req, res) => {
    const c = await OnboardingCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (c.status !== 'PROBATION') return res.status(400).json({ error: 'case must be in PROBATION state' });
    if (!c.convertedUser) return res.status(400).json({ error: 'no converted user' });

    const { action, extensionMonths, notes } = req.body;

    if (action === 'confirm') {
      c.status = 'CONFIRMED';
      c.confirmedAt = new Date();
      await c.save();
      await User.updateOne({ _id: c.convertedUser }, { $unset: { probationEndDate: '' } });
      res.json(c);
    } else if (action === 'extend') {
      const months = extensionMonths || 3;
      const user = await User.findById(c.convertedUser);
      const newEnd = new Date(user.probationEndDate || new Date());
      newEnd.setMonth(newEnd.getMonth() + months);
      await User.updateOne({ _id: c.convertedUser }, { $set: { probationEndDate: newEnd } });
      res.json({ case: c, newProbationEndDate: newEnd });
    } else if (action === 'terminate') {
      c.status = 'TERMINATED';
      await c.save();
      await User.updateOne({ _id: c.convertedUser }, { $set: { active: false } });
      res.json(c);
    } else {
      res.status(400).json({ error: 'action must be confirm, extend, or terminate' });
    }
  }));

  return router;
}

// --- Helpers ---

async function instantiateTasks(onboardingCase) {
  if (!onboardingCase.workflowTemplate) return;
  const template = await OnboardingTemplate.findById(onboardingCase.workflowTemplate);
  if (!template) return;

  const existing = await OnboardingTask.countDocuments({ onboardingCase: onboardingCase._id });
  if (existing > 0) return;

  const roleToUser = {
    manager: onboardingCase.reportingManager,
    hr: onboardingCase.createdBy,
    admin: onboardingCase.createdBy,
  };

  const tasksToCreate = template.tasks.map(t => {
    const runsOn = t.runsOn || (t.ownerRole === 'candidate' ? 'candidate' : 'employee');
    return {
      onboardingCase: onboardingCase._id,
      templateKey: t.key,
      title: t.title,
      ownerRole: t.ownerRole,
      taskType: t.taskType || 'manual',
      phase: t.phase || 'first_day',
      runsOn,
      assignedTo: runsOn === 'candidate' ? null : (roleToUser[t.ownerRole] || null),
      dueDate: t.offsetDays != null
        ? new Date(onboardingCase.joiningDate.getTime() + t.offsetDays * 86400000)
        : null,
      dependsOn: t.dependsOn || [],
      mandatory: t.mandatory,
    };
  });
  await OnboardingTask.insertMany(tasksToCreate);
  await OnboardingTemplate.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });
}

async function reassignTasksOnConvert(onboardingCase, userId) {
  await OnboardingTask.updateMany(
    { onboardingCase: onboardingCase._id, runsOn: 'employee', ownerRole: 'candidate', assignedTo: null },
    { $set: { assignedTo: userId } }
  );
}

async function createDefaultDocRequests(onboardingCase) {
  const existing = await DocumentRequest.countDocuments({ onboardingCase: onboardingCase._id });
  if (existing > 0) return;
  const defaultDocs = [
    { docType: 'pan', mandatory: true },
    { docType: 'aadhaar', mandatory: true },
    { docType: 'bank_proof', mandatory: true },
    { docType: 'photo', mandatory: true },
    { docType: 'education', mandatory: false },
    { docType: 'prev_payslip', mandatory: false },
    { docType: 'relieving_letter', mandatory: false },
    { docType: 'experience_letter', mandatory: false },
    { docType: 'address_proof', mandatory: false },
  ];
  await DocumentRequest.insertMany(
    defaultDocs.map(d => ({ ...d, onboardingCase: onboardingCase._id }))
  );
}
