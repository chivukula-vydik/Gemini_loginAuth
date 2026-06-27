# HR Onboarding Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an onboarding module that takes candidates from offer through document collection, task workflows, and day-1 joining to produce a real `User` + `SalaryStructure` + payroll setup — the seam between hiring and the existing system.

**Architecture:** Express routes at `/onboarding` (authenticated) and `/onboarding/portal/:token` (token-scoped for candidates). Five new Mongoose models (`OnboardingCase`, `Offer`, `OnboardingTemplate`, `OnboardingTask`, `DocumentRequest`). React frontend with a Kanban board, case detail page with tabs, template builder, and a standalone candidate portal. Conversion is a single transactional operation that creates User + SalaryStructure + LeaveBalance.

**Tech Stack:** Node/Express, MongoDB/Mongoose, React/TypeScript/Vite, multer + GridFS for doc uploads.

## Global Constraints

- Node ESM (`"type": "module"`, `import`/`export` syntax)
- All route files export a `createXxxRouter()` factory function
- Auth middleware: `requireAuth` (JWT Bearer), `requireRole(...roles)` for role gating
- Async routes wrapped in `asyncHandler`
- Frontend uses `authed()` / `authedRaw()` from `src/fetchHelper.ts` for API calls
- CSS uses project CSS variables (`--text`, `--muted`, `--card`, `--border`, `--accent`, `--bg`, `--shadow`, `--radius`, `--radius-sm`)
- Nav items defined in `web/src/pm/nav.ts`, routes in `web/src/AppShell.tsx`
- `SalaryComponentSchema` shape: `{ key, label, type, calc, value, taxable, proratable }` (no `_id`)

---

## File Map

### Backend — Models (create)
- `auth-api/src/models/OnboardingCase.js` — case lifecycle + candidate data
- `auth-api/src/models/Offer.js` — offer versioning + comp preview
- `auth-api/src/models/OnboardingTemplate.js` — reusable task templates
- `auth-api/src/models/OnboardingTask.js` — instantiated tasks per case
- `auth-api/src/models/DocumentRequest.js` — doc requests + submissions

### Backend — Routes (create)
- `auth-api/src/routes/onboarding.js` — cases, offers, tasks, docs, conversion, confirmation
- `auth-api/src/routes/onboardingPortal.js` — candidate self-service (token-scoped)

### Backend — Modify
- `auth-api/src/app.js` — mount `/onboarding` and `/onboarding/portal` routers

### Frontend — Create
- `web/src/onboarding/OnboardingBoard.tsx` + `.css` — Kanban board
- `web/src/onboarding/OnboardingBoard.css` — board styles
- `web/src/onboarding/CaseDetail.tsx` — tabbed case view
- `web/src/onboarding/CaseDetail.css` — case detail styles
- `web/src/onboarding/MyOnboardingTasks.tsx` — cross-cutting task queue
- `web/src/onboarding/MyOnboardingTasks.css` — task queue styles
- `web/src/onboarding/TemplateBuilder.tsx` — task template CRUD
- `web/src/onboarding/TemplateBuilder.css` — template builder styles
- `web/src/onboarding/CandidatePortal.tsx` — standalone portal page
- `web/src/onboarding/CandidatePortal.css` — portal styles
- `web/src/onboarding/index.ts` — barrel exports

### Frontend — Modify
- `web/src/pm/nav.ts` — add `onboarding`, `onboarding-tasks` nav keys
- `web/src/AppShell.tsx` — add routes + nav icons
- `web/src/App.tsx` — add portal route (outside AppShell)

---

### Task 1: OnboardingCase Model + State Machine

**Files:**
- Create: `auth-api/src/models/OnboardingCase.js`

**Interfaces:**
- Produces: `OnboardingCase` model, `VALID_TRANSITIONS` map, `TERMINAL_STATES` set — used by Task 3 (routes) and Task 6 (conversion)

- [ ] **Step 1: Create the OnboardingCase model**

Create `auth-api/src/models/OnboardingCase.js`:

```js
import mongoose from 'mongoose';
import crypto from 'crypto';

const STATUSES = [
  'DRAFT','OFFER_SENT','OFFER_ACCEPTED','PRE_BOARDING','JOINED',
  'INDUCTION','PROBATION','CONFIRMED','OFFER_DECLINED','CANCELLED','TERMINATED',
];

export const TERMINAL_STATES = new Set(['OFFER_DECLINED', 'CANCELLED', 'TERMINATED', 'CONFIRMED']);

export const VALID_TRANSITIONS = {
  DRAFT:           ['OFFER_SENT', 'CANCELLED'],
  OFFER_SENT:      ['OFFER_ACCEPTED', 'OFFER_DECLINED', 'CANCELLED'],
  OFFER_ACCEPTED:  ['PRE_BOARDING', 'CANCELLED'],
  PRE_BOARDING:    ['JOINED', 'CANCELLED'],
  JOINED:          ['INDUCTION'],
  INDUCTION:       ['PROBATION'],
  PROBATION:       ['CONFIRMED', 'TERMINATED'],
};

const OnboardingCaseSchema = new mongoose.Schema({
  candidate: {
    firstName:     { type: String, required: true },
    lastName:      { type: String, required: true },
    personalEmail: { type: String, required: true },
    phone:         { type: String, default: '' },
  },
  designation:      { type: String, default: '' },
  department:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  payGrade:         { type: mongoose.Schema.Types.ObjectId, ref: 'PayGrade', default: null },
  payGroup:         { type: mongoose.Schema.Types.ObjectId, ref: 'PayGroup', default: null },
  workLocation:     { type: String, default: '' },
  employmentType:   { type: String, enum: ['full_time', 'contract', 'intern'], default: 'full_time' },
  joiningDate:      { type: Date, required: true },
  probationMonths:  { type: Number, default: 3 },
  status: {
    type: String,
    enum: STATUSES,
    default: 'DRAFT',
    index: true,
  },
  workflowTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingTemplate', default: null },
  createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  convertedUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  confirmedAt:      { type: Date, default: null },
  portalTokenHash:  { type: String, default: null, index: true },
  portalTokenExpiry: { type: Date, default: null },
}, { timestamps: true });

OnboardingCaseSchema.methods.generatePortalToken = function () {
  const raw = crypto.randomBytes(24).toString('hex');
  this.portalTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiry = new Date(this.joiningDate);
  expiry.setDate(expiry.getDate() + 7);
  this.portalTokenExpiry = expiry;
  return raw;
};

OnboardingCaseSchema.statics.findByPortalToken = async function (raw) {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const c = await this.findOne({ portalTokenHash: hash });
  if (!c || !c.portalTokenExpiry || c.portalTokenExpiry < new Date()) return null;
  return c;
};

export const OnboardingCase = mongoose.model('OnboardingCase', OnboardingCaseSchema);
```

- [ ] **Step 2: Verify the model loads**

Run from the auth-api directory:

```bash
node -e "import('./src/models/OnboardingCase.js').then(m => { console.log('Statuses:', m.VALID_TRANSITIONS); console.log('OK'); })"
```

Expected: prints the transitions map and "OK".

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/OnboardingCase.js
git commit -m "feat(onboarding): add OnboardingCase model with state machine"
```

---

### Task 2: Offer, OnboardingTemplate, OnboardingTask, DocumentRequest Models

**Files:**
- Create: `auth-api/src/models/Offer.js`
- Create: `auth-api/src/models/OnboardingTemplate.js`
- Create: `auth-api/src/models/OnboardingTask.js`
- Create: `auth-api/src/models/DocumentRequest.js`

**Interfaces:**
- Consumes: `SalaryComponentSchema` shape from `auth-api/src/models/SalaryStructure.js` (replicated, not imported, because SalaryStructure exports only the model)
- Produces: `Offer`, `OnboardingTemplate`, `OnboardingTask`, `DocumentRequest` models — used by Task 3 (routes)

- [ ] **Step 1: Create the Offer model**

Create `auth-api/src/models/Offer.js`:

```js
import mongoose from 'mongoose';

const SalaryComponentSchema = new mongoose.Schema({
  key:        { type: String, required: true },
  label:      { type: String, required: true },
  type:       { type: String, enum: ['earning', 'deduction'], required: true },
  calc:       { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_ctc'], required: true },
  value:      { type: Number, required: true },
  taxable:    { type: Boolean, default: true },
  proratable: { type: Boolean, default: true },
}, { _id: false });

const OfferSchema = new mongoose.Schema({
  onboardingCase: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingCase', required: true, index: true },
  version:        { type: Number, default: 1 },
  ctcAnnual:      { type: Number, default: 0 },
  componentsPreview: [SalaryComponentSchema],
  joiningDate:    { type: Date, default: null },
  expiryDate:     { type: Date, default: null },
  letterUrl:      { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'declined', 'expired', 'revised'],
    default: 'draft',
  },
  sentAt:       { type: Date, default: null },
  respondedAt:  { type: Date, default: null },
  candidateSignature: {
    signedAt: { type: Date, default: null },
    ip:       { type: String, default: '' },
  },
  declineReason: { type: String, default: '' },
}, { timestamps: true });

export const Offer = mongoose.model('Offer', OfferSchema);
```

- [ ] **Step 2: Create the OnboardingTemplate model**

Create `auth-api/src/models/OnboardingTemplate.js`:

```js
import mongoose from 'mongoose';

const TemplateTaskSchema = new mongoose.Schema({
  key:        { type: String, required: true },
  title:      { type: String, required: true },
  ownerRole:  { type: String, enum: ['hr', 'it', 'manager', 'finance', 'candidate', 'admin'], required: true },
  offsetDays: { type: Number, default: 0 },
  dependsOn:  [{ type: String }],
  category:   { type: String, enum: ['document', 'asset', 'access', 'training', 'admin'], default: 'admin' },
  mandatory:  { type: Boolean, default: true },
}, { _id: false });

const OnboardingTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  appliesTo: {
    employmentType: { type: String, default: '' },
    department:     { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  },
  tasks: [TemplateTaskSchema],
}, { timestamps: true });

export const OnboardingTemplate = mongoose.model('OnboardingTemplate', OnboardingTemplateSchema);
```

- [ ] **Step 3: Create the OnboardingTask model**

Create `auth-api/src/models/OnboardingTask.js`:

```js
import mongoose from 'mongoose';

const OnboardingTaskSchema = new mongoose.Schema({
  onboardingCase: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingCase', required: true, index: true },
  templateKey:    { type: String, default: '' },
  title:          { type: String, required: true },
  ownerRole:      { type: String, default: '' },
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dueDate:        { type: Date, default: null },
  dependsOn:      [{ type: String }],
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'done', 'skipped'],
    default: 'pending',
    index: true,
  },
  mandatory:    { type: Boolean, default: true },
  completedAt:  { type: Date, default: null },
  completedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export const OnboardingTask = mongoose.model('OnboardingTask', OnboardingTaskSchema);
```

- [ ] **Step 4: Create the DocumentRequest model**

Create `auth-api/src/models/DocumentRequest.js`:

```js
import mongoose from 'mongoose';

const DOC_TYPES = [
  'pan', 'aadhaar', 'bank_proof', 'photo', 'education',
  'prev_payslip', 'relieving_letter', 'experience_letter', 'address_proof',
];

const DocumentRequestSchema = new mongoose.Schema({
  onboardingCase: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingCase', required: true, index: true },
  docType: { type: String, enum: DOC_TYPES, required: true },
  mandatory: { type: Boolean, default: true },
  submission: {
    fileId:      { type: mongoose.Schema.Types.ObjectId, default: null },
    filename:    { type: String, default: '' },
    contentType: { type: String, default: '' },
    size:        { type: Number, default: 0 },
    uploadedAt:  { type: Date, default: null },
    extractedFields: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  verifyStatus: {
    type: String,
    enum: ['awaiting', 'submitted', 'verified', 'rejected'],
    default: 'awaiting',
    index: true,
  },
  verifiedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt:      { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
}, { timestamps: true });

export const DocumentRequest = mongoose.model('DocumentRequest', DocumentRequestSchema);
```

- [ ] **Step 5: Verify all models load**

```bash
node -e "
  Promise.all([
    import('./src/models/Offer.js'),
    import('./src/models/OnboardingTemplate.js'),
    import('./src/models/OnboardingTask.js'),
    import('./src/models/DocumentRequest.js'),
  ]).then(() => console.log('All models OK'));
"
```

Expected: "All models OK"

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/Offer.js auth-api/src/models/OnboardingTemplate.js auth-api/src/models/OnboardingTask.js auth-api/src/models/DocumentRequest.js
git commit -m "feat(onboarding): add Offer, OnboardingTemplate, OnboardingTask, DocumentRequest models"
```

---

### Task 3: Onboarding API Routes — Cases, Transitions, Offers

**Files:**
- Create: `auth-api/src/routes/onboarding.js`
- Modify: `auth-api/src/app.js` (add import + mount)

**Interfaces:**
- Consumes: `OnboardingCase`, `VALID_TRANSITIONS`, `TERMINAL_STATES` (Task 1), `Offer` (Task 2)
- Produces: `createOnboardingRouter()` — mounted at `/onboarding` in app.js. Endpoints: `POST /`, `GET /`, `GET /:id`, `POST /:id/transition`, `POST /:id/offer`, `POST /:id/offer/send`

- [ ] **Step 1: Create the onboarding routes file**

Create `auth-api/src/routes/onboarding.js`:

```js
import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
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
import crypto from 'crypto';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getDocBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'onboardingDocs' });
}

export function createOnboardingRouter() {
  const router = express.Router();

  // --- Cases ---

  router.post('/', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
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

  router.get('/', requireAuth, requireRole('admin', 'hr', 'reporting_manager'), asyncHandler(async (req, res) => {
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
    res.json(cases);
  }));

  router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
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
    const mandatoryTasks = tasks.filter(t => t.mandatory);
    const allMandatoryTasksDone = mandatoryTasks.every(t => t.status === 'done');
    const readyToConvert = allMandatoryDocsVerified && allMandatoryTasksDone && offer?.status === 'accepted';

    res.json({ ...c.toObject(), offer, tasks: enrichedTasks, documents: docs, readyToConvert });
  }));

  // --- Transitions ---

  router.post('/:id/transition', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
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

  router.post('/:id/offer', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
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

  router.post('/:id/offer/send', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
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
    res.json({ offer, portalLink: `/onboarding/portal/${token}` });
  }));

  // --- Tasks ---

  router.get('/:id/tasks', requireAuth, asyncHandler(async (req, res) => {
    const tasks = await OnboardingTask.find({ onboardingCase: req.params.id })
      .populate('assignedTo', 'displayName email').sort('dueDate');
    const doneKeys = new Set(tasks.filter(t => t.status === 'done').map(t => t.templateKey));
    const enriched = tasks.map(t => ({
      ...t.toObject(),
      blocked: t.dependsOn.length > 0 && !t.dependsOn.every(dep => doneKeys.has(dep)),
    }));
    res.json(enriched);
  }));

  router.post('/tasks/:taskId/complete', requireAuth, asyncHandler(async (req, res) => {
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

  router.get('/tasks/mine', requireAuth, asyncHandler(async (req, res) => {
    const tasks = await OnboardingTask.find({ assignedTo: req.user.sub, status: { $ne: 'done' } })
      .populate({ path: 'onboardingCase', select: 'candidate designation status joiningDate' })
      .sort('dueDate');
    res.json(tasks);
  }));

  // --- Documents ---

  router.get('/:id/documents', requireAuth, asyncHandler(async (req, res) => {
    const docs = await DocumentRequest.find({ onboardingCase: req.params.id });
    res.json(docs);
  }));

  router.post('/:id/documents', requireAuth, requireRole('admin', 'hr'), upload.single('file'), asyncHandler(async (req, res) => {
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

  router.post('/documents/:docId/verify', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
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

  router.post('/documents/:docId/reject', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
    const doc = await DocumentRequest.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.verifyStatus !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    doc.verifyStatus = 'rejected';
    doc.rejectionReason = req.body.reason || '';
    await doc.save();
    res.json(doc);
  }));

  router.get('/documents/:fileId/download', asyncHandler(async (req, res) => {
    const bucket = getDocBucket();
    const oid = new mongoose.Types.ObjectId(req.params.fileId);
    const files = await bucket.find({ _id: oid }).toArray();
    if (!files.length) return res.status(404).json({ error: 'file not found' });
    res.set('Content-Type', files[0].contentType);
    res.set('Content-Disposition', `inline; filename="${files[0].filename}"`);
    bucket.openDownloadStream(oid).pipe(res);
  }));

  // --- Templates ---

  router.get('/templates', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
    const templates = await OnboardingTemplate.find().sort('-createdAt');
    res.json(templates);
  }));

  router.post('/templates', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
    const { name, appliesTo, tasks } = req.body;
    if (!name || !tasks?.length) return res.status(400).json({ error: 'name and tasks required' });
    const template = await OnboardingTemplate.create({ name, appliesTo, tasks });
    res.status(201).json(template);
  }));

  router.put('/templates/:id', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
    const template = await OnboardingTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!template) return res.status(404).json({ error: 'not found' });
    res.json(template);
  }));

  // --- Conversion ---

  router.post('/:id/convert', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
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

    const joiningStr = c.joiningDate.toISOString().slice(0, 10);
    const probEnd = new Date(c.joiningDate);
    probEnd.setMonth(probEnd.getMonth() + (c.probationMonths || 3));

    const panDoc = await DocumentRequest.findOne({ onboardingCase: c._id, docType: 'pan', verifyStatus: 'verified' });
    const aadhaarDoc = await DocumentRequest.findOne({ onboardingCase: c._id, docType: 'aadhaar', verifyStatus: 'verified' });
    const bankDoc = await DocumentRequest.findOne({ onboardingCase: c._id, docType: 'bank_proof', verifyStatus: 'verified' });

    const empType = c.employmentType === 'full_time' ? 'full-time' : c.employmentType;

    const user = await User.create({
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
      pan: panDoc?.submission?.extractedFields?.panNumber || '',
      aadhaar: aadhaarDoc?.submission?.extractedFields?.aadhaarNumber || '',
      bankName: bankDoc?.submission?.extractedFields?.bankName || '',
      bankAccount: bankDoc?.submission?.extractedFields?.accountNumber || '',
      ifsc: bankDoc?.submission?.extractedFields?.ifsc || '',
    });

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
    await LeaveBalance.create({
      userId: user._id,
      year: joiningYear,
      casual: { total: Math.round(DEFAULT_QUOTAS.casual * remainingMonths / 12), used: 0 },
      sick:   { total: Math.round(DEFAULT_QUOTAS.sick * remainingMonths / 12), used: 0 },
      earned: { total: Math.round(DEFAULT_QUOTAS.earned * remainingMonths / 12), used: 0 },
    });

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 1);
    await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt: tokenExpiry });

    c.convertedUser = user._id;
    c.status = 'INDUCTION';
    await c.save();

    res.json({ case: c, user, passwordSetLink: `/auth/local/reset-password?token=${rawToken}` });
  }));

  // --- Confirmation ---

  router.post('/:id/confirm', requireAuth, requireRole('admin', 'hr', 'reporting_manager'), asyncHandler(async (req, res) => {
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

  const roleToUser = {
    manager: onboardingCase.reportingManager,
    hr: onboardingCase.createdBy,
    admin: onboardingCase.createdBy,
  };

  const tasksToCreate = template.tasks.map(t => ({
    onboardingCase: onboardingCase._id,
    templateKey: t.key,
    title: t.title,
    ownerRole: t.ownerRole,
    assignedTo: roleToUser[t.ownerRole] || null,
    dueDate: t.offsetDays != null
      ? new Date(onboardingCase.joiningDate.getTime() + t.offsetDays * 86400000)
      : null,
    dependsOn: t.dependsOn || [],
    mandatory: t.mandatory,
  }));
  await OnboardingTask.insertMany(tasksToCreate);
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
```

- [ ] **Step 2: Mount the router in app.js**

In `auth-api/src/app.js`, add the import after the declarations import (line 32):

```js
import { createOnboardingRouter } from './routes/onboarding.js';
```

Add the route mount after the declarations line (line 118):

```js
  app.use('/onboarding', createOnboardingRouter());
```

- [ ] **Step 3: Verify the server starts**

```bash
cd auth-api && node -e "import('./src/routes/onboarding.js').then(m => console.log('Router factory:', typeof m.createOnboardingRouter))"
```

Expected: `Router factory: function`

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/onboarding.js auth-api/src/app.js
git commit -m "feat(onboarding): add onboarding API routes — cases, offers, tasks, docs, conversion, confirmation"
```

---

### Task 4: Candidate Portal API Routes

**Files:**
- Create: `auth-api/src/routes/onboardingPortal.js`
- Modify: `auth-api/src/app.js` (add import + mount)

**Interfaces:**
- Consumes: `OnboardingCase.findByPortalToken()` (Task 1), `Offer` (Task 2), `OnboardingTask` (Task 2), `DocumentRequest` (Task 2), `getDocBucket()` pattern (Task 3)
- Produces: `createOnboardingPortalRouter()` — mounted at `/onboarding/portal` in app.js. Token-scoped endpoints for candidates.

- [ ] **Step 1: Create the portal routes**

Create `auth-api/src/routes/onboardingPortal.js`:

```js
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
```

- [ ] **Step 2: Mount in app.js**

In `auth-api/src/app.js`, add after the onboarding import:

```js
import { createOnboardingPortalRouter } from './routes/onboardingPortal.js';
```

Add the mount (before the error handler, after onboarding mount):

```js
  app.use('/onboarding/portal', createOnboardingPortalRouter());
```

**Important:** The portal mount must come AFTER the main onboarding mount because Express matches routes in order and `/onboarding/portal` is more specific.

- [ ] **Step 3: Verify the server starts**

```bash
cd auth-api && node -e "import('./src/routes/onboardingPortal.js').then(m => console.log('Portal factory:', typeof m.createOnboardingPortalRouter))"
```

Expected: `Portal factory: function`

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/onboardingPortal.js auth-api/src/app.js
git commit -m "feat(onboarding): add candidate self-service portal API (token-scoped)"
```

---

### Task 5: Frontend — Onboarding Board (Kanban)

**Files:**
- Create: `web/src/onboarding/OnboardingBoard.tsx`
- Create: `web/src/onboarding/OnboardingBoard.css`
- Create: `web/src/onboarding/index.ts`

**Interfaces:**
- Consumes: `authed()` from `src/fetchHelper.ts`, `GET /onboarding` API (Task 3)
- Produces: `OnboardingBoard` component — used by Task 9 (AppShell routing)

- [ ] **Step 1: Create the barrel export**

Create `web/src/onboarding/index.ts`:

```ts
export { OnboardingBoard } from './OnboardingBoard';
export { CaseDetail } from './CaseDetail';
export { MyOnboardingTasks } from './MyOnboardingTasks';
export { TemplateBuilder } from './TemplateBuilder';
export { CandidatePortal } from './CandidatePortal';
```

- [ ] **Step 2: Create the board CSS**

Create `web/src/onboarding/OnboardingBoard.css`:

```css
.ob-page { padding: 28px 32px; }
.ob-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }
.ob-board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 16px; }
.ob-column { min-width: 260px; max-width: 280px; flex-shrink: 0; }
.ob-col-header { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.ob-col-count { background: var(--border); border-radius: 10px; padding: 1px 8px; font-size: 10px; font-weight: 600; color: var(--muted); }
.ob-col-cards { display: flex; flex-direction: column; gap: 8px; }
.ob-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow); cursor: pointer; transition: border-color 0.12s; }
.ob-card:hover { border-color: var(--accent); }
.ob-card-name { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.ob-card-role { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
.ob-card-meta { display: flex; align-items: center; justify-content: space-between; }
.ob-card-date { font-size: 11px; color: var(--muted); }
.ob-card-progress { font-size: 11px; font-weight: 600; }
.ob-card-progress.ready { color: #15803d; }
.ob-card-progress.partial { color: #b45309; }
.ob-empty { text-align: center; color: var(--faint); padding: 40px; font-size: 13px; }

.ob-create-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.ob-create-card { background: var(--card); border-radius: var(--radius); padding: 28px 32px; width: 520px; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.ob-create-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 18px; }
.ob-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.ob-form-group { display: flex; flex-direction: column; gap: 5px; }
.ob-form-label { font-size: 12px; font-weight: 600; color: var(--muted); }
.ob-form-full { grid-column: 1 / -1; }
```

- [ ] **Step 3: Create the OnboardingBoard component**

Create `web/src/onboarding/OnboardingBoard.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './OnboardingBoard.css';

interface Case {
  _id: string;
  candidate: { firstName: string; lastName: string; personalEmail: string };
  designation: string;
  department?: { name: string };
  joiningDate: string;
  status: string;
  reportingManager?: { displayName: string };
}

const COLUMNS = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'OFFER_SENT', label: 'Offer Sent' },
  { status: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
  { status: 'PRE_BOARDING', label: 'Pre-boarding' },
  { status: 'JOINED', label: 'Joined' },
  { status: 'INDUCTION', label: 'Induction' },
  { status: 'PROBATION', label: 'Probation' },
];

export function OnboardingBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    authed('/onboarding').then(d => { setCases(d); setLoaded(true); });
  }, []);

  const [form, setForm] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '',
    designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time',
  });

  async function createCase() {
    const body = {
      candidate: { firstName: form.firstName, lastName: form.lastName, personalEmail: form.personalEmail, phone: form.phone },
      designation: form.designation,
      joiningDate: form.joiningDate,
      probationMonths: form.probationMonths,
      employmentType: form.employmentType,
    };
    const c = await authed('/onboarding', 'POST', body);
    setCases(prev => [c, ...prev]);
    setShowCreate(false);
    setForm({ firstName: '', lastName: '', personalEmail: '', phone: '', designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time' });
  }

  if (!loaded) return <div className="ob-page"><div className="ob-empty">Loading...</div></div>;

  return (
    <div className="ob-page">
      <div className="ob-title">
        <span>Onboarding</span>
        <button className="pr-btn" onClick={() => setShowCreate(true)}>New Case</button>
      </div>
      <div className="ob-board">
        {COLUMNS.map(col => {
          const items = cases.filter(c => c.status === col.status);
          return (
            <div key={col.status} className="ob-column">
              <div className="ob-col-header">
                {col.label}
                <span className="ob-col-count">{items.length}</span>
              </div>
              <div className="ob-col-cards">
                {items.map(c => (
                  <div key={c._id} className="ob-card" onClick={() => navigate(`/onboarding/${c._id}`)}>
                    <div className="ob-card-name">{c.candidate.firstName} {c.candidate.lastName}</div>
                    <div className="ob-card-role">{c.designation}{c.department ? ` — ${c.department.name}` : ''}</div>
                    <div className="ob-card-meta">
                      <span className="ob-card-date">{new Date(c.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--faint)', padding: 12 }}>No cases</div>}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <div className="ob-create-modal" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="ob-create-card">
            <div className="ob-create-title">New Onboarding Case</div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">First Name</label>
                <input className="se-input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Last Name</label>
                <input className="se-input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Email</label>
                <input className="se-input" type="email" value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Phone</label>
                <input className="se-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Designation</label>
                <input className="se-input" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Joining Date</label>
                <input className="se-input" type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Employment Type</label>
                <select className="se-select" value={form.employmentType} onChange={e => setForm(f => ({ ...f, employmentType: e.target.value }))}>
                  <option value="full_time">Full Time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Probation (months)</label>
                <input className="se-input" type="number" value={form.probationMonths} onChange={e => setForm(f => ({ ...f, probationMonths: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="pr-btn" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="pr-btn" onClick={createCase} disabled={!form.firstName || !form.lastName || !form.personalEmail || !form.joiningDate}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/onboarding/OnboardingBoard.tsx web/src/onboarding/OnboardingBoard.css web/src/onboarding/index.ts
git commit -m "feat(onboarding): add Kanban board UI for onboarding cases"
```

---

### Task 6: Frontend — Case Detail Page (Tabs)

**Files:**
- Create: `web/src/onboarding/CaseDetail.tsx`
- Create: `web/src/onboarding/CaseDetail.css`

**Interfaces:**
- Consumes: `authed()` / `authedRaw()` from `src/fetchHelper.ts`, `GET /onboarding/:id`, `POST /onboarding/:id/transition`, `POST /onboarding/:id/offer`, `POST /onboarding/:id/offer/send`, `POST /onboarding/:id/convert`, `POST /onboarding/tasks/:taskId/complete`, `POST /onboarding/documents/:docId/verify`, `POST /onboarding/documents/:docId/reject`, `POST /onboarding/:id/documents` (Task 3)
- Produces: `CaseDetail` component — used by Task 9 (AppShell routing at `/onboarding/:id`)

- [ ] **Step 1: Create the case detail CSS**

Create `web/src/onboarding/CaseDetail.css`:

```css
.cd-page { padding: 28px 32px; max-width: 960px; }
.cd-back { font-size: 13px; color: var(--accent); cursor: pointer; margin-bottom: 16px; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; }
.cd-back:hover { text-decoration: underline; }
.cd-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.cd-name { font-size: 20px; font-weight: 700; color: var(--text); }
.cd-status { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; border-radius: 12px; background: rgba(59,130,246,0.12); color: #1d4ed8; }

.cd-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.cd-tab { padding: 10px 18px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none; }
.cd-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.cd-tab:hover { color: var(--text); }

.cd-section { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; box-shadow: var(--shadow); margin-bottom: 16px; }
.cd-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.cd-field { margin-bottom: 10px; }
.cd-field-label { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 2px; }
.cd-field-value { font-size: 14px; color: var(--text); }
.cd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.cd-actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.cd-btn-sm { padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid var(--border); background: var(--card); color: var(--text); transition: border-color 0.12s; }
.cd-btn-sm:hover { border-color: var(--accent); color: var(--accent); }
.cd-btn-sm.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.cd-btn-sm.primary:hover { opacity: 0.9; }
.cd-btn-sm.danger { color: #dc2626; border-color: #dc2626; }
.cd-btn-sm:disabled { opacity: 0.5; cursor: default; }

.cd-task-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.cd-task-row:last-child { border-bottom: none; }
.cd-task-check { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent); }
.cd-task-title { font-size: 13px; color: var(--text); flex: 1; }
.cd-task-title.done { text-decoration: line-through; color: var(--muted); }
.cd-task-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; }
.cd-task-badge.blocked { background: rgba(239,68,68,0.12); color: #dc2626; }
.cd-task-badge.pending { background: rgba(234,179,8,0.12); color: #b45309; }
.cd-task-badge.done { background: rgba(34,197,94,0.12); color: #15803d; }

.cd-doc-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
.cd-doc-row:last-child { border-bottom: none; }
.cd-doc-type { font-size: 13px; font-weight: 600; color: var(--text); text-transform: uppercase; }
.cd-doc-status { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; }
.cd-doc-status.awaiting { background: var(--bg); color: var(--muted); }
.cd-doc-status.submitted { background: rgba(234,179,8,0.12); color: #b45309; }
.cd-doc-status.verified { background: rgba(34,197,94,0.12); color: #15803d; }
.cd-doc-status.rejected { background: rgba(239,68,68,0.12); color: #dc2626; }

.cd-comp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cd-comp-table th { text-align: left; font-size: 11px; font-weight: 600; color: var(--muted); padding: 6px 10px; border-bottom: 1px solid var(--border); }
.cd-comp-table td { padding: 6px 10px; color: var(--text); border-bottom: 1px solid var(--border); }

.cd-convert-gate { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.cd-gate-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.cd-gate-icon { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.cd-gate-icon.pass { background: rgba(34,197,94,0.12); color: #15803d; }
.cd-gate-icon.fail { background: rgba(239,68,68,0.12); color: #dc2626; }
```

- [ ] **Step 2: Create the CaseDetail component**

Create `web/src/onboarding/CaseDetail.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authed, authedRaw } from '../fetchHelper';
import './CaseDetail.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Task { _id: string; templateKey: string; title: string; ownerRole: string; assignedTo?: { displayName: string }; dueDate: string; status: string; blocked: boolean; mandatory: boolean; }
interface Doc { _id: string; docType: string; mandatory: boolean; verifyStatus: string; submission?: { fileId: string; filename: string; size: number }; rejectionReason?: string; }
interface Offer { _id: string; version: number; ctcAnnual: number; componentsPreview: { key: string; label: string; type: string; calc: string; value: number }[]; status: string; sentAt?: string; respondedAt?: string; }
interface CaseData {
  _id: string; candidate: { firstName: string; lastName: string; personalEmail: string; phone: string };
  designation: string; department?: { name: string }; reportingManager?: { displayName: string };
  payGrade?: { code: string; label: string }; payGroup?: { name: string };
  workLocation: string; employmentType: string; joiningDate: string; probationMonths: number;
  status: string; offer?: Offer; tasks: Task[]; documents: Doc[]; readyToConvert: boolean;
  convertedUser?: string; confirmedAt?: string;
}

const TABS = ['Overview', 'Offer', 'Tasks', 'Documents'];

const NEXT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CANCELLED'],
  OFFER_SENT: ['CANCELLED'],
  OFFER_ACCEPTED: ['PRE_BOARDING', 'CANCELLED'],
  PRE_BOARDING: ['JOINED', 'CANCELLED'],
  INDUCTION: ['PROBATION'],
};

export function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CaseData | null>(null);
  const [tab, setTab] = useState('Overview');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocId, setUploadDocId] = useState<string | null>(null);

  const load = () => authed(`/onboarding/${id}`).then(setData);
  useEffect(() => { load(); }, [id]);

  async function transition(to: string) {
    setBusy(true);
    await authed(`/onboarding/${id}/transition`, 'POST', { to });
    await load();
    setBusy(false);
  }

  async function completeTask(taskId: string) {
    await authed(`/onboarding/tasks/${taskId}/complete`, 'POST');
    await load();
  }

  async function verifyDoc(docId: string) {
    await authed(`/onboarding/documents/${docId}/verify`, 'POST');
    await load();
  }

  async function rejectDoc(docId: string) {
    const reason = prompt('Rejection reason:');
    if (reason === null) return;
    await authed(`/onboarding/documents/${docId}/reject`, 'POST', { reason });
    await load();
  }

  async function uploadDoc(docId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docId', docId);
    await authedRaw(`/onboarding/${id}/documents`, 'POST', fd);
    await load();
  }

  function triggerUpload(docId: string) {
    setUploadDocId(docId);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && uploadDocId) uploadDoc(uploadDocId, file);
    e.target.value = '';
    setUploadDocId(null);
  }

  async function createOffer() {
    const ctc = prompt('Annual CTC:');
    if (!ctc) return;
    await authed(`/onboarding/${id}/offer`, 'POST', { ctcAnnual: Number(ctc), componentsPreview: [] });
    await load();
  }

  async function sendOffer() {
    setBusy(true);
    await authed(`/onboarding/${id}/offer/send`, 'POST');
    await load();
    setBusy(false);
  }

  async function convert() {
    if (!confirm('This will create a real employee account. Proceed?')) return;
    setBusy(true);
    await authed(`/onboarding/${id}/convert`, 'POST');
    await load();
    setBusy(false);
  }

  async function confirmAction(action: string) {
    setBusy(true);
    const body: Record<string, unknown> = { action };
    if (action === 'extend') {
      const months = prompt('Extension months:', '3');
      if (!months) { setBusy(false); return; }
      body.extensionMonths = Number(months);
    }
    await authed(`/onboarding/${id}/confirm`, 'POST', body);
    await load();
    setBusy(false);
  }

  if (!data) return <div className="cd-page"><div className="ob-empty">Loading...</div></div>;

  const nextMoves = NEXT_TRANSITIONS[data.status] || [];

  return (
    <div className="cd-page">
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} />
      <a className="cd-back" onClick={() => navigate('/onboarding')}>Back to Board</a>
      <div className="cd-header">
        <div>
          <div className="cd-name">{data.candidate.firstName} {data.candidate.lastName}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{data.designation}{data.department ? ` — ${data.department.name}` : ''}</div>
        </div>
        <span className="cd-status">{data.status.replace(/_/g, ' ')}</span>
      </div>

      <div className="cd-tabs">
        {TABS.map(t => <button key={t} className={`cd-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="cd-section">
            <div className="cd-section-title">Candidate Info</div>
            <div className="cd-grid">
              <div className="cd-field"><div className="cd-field-label">Email</div><div className="cd-field-value">{data.candidate.personalEmail}</div></div>
              <div className="cd-field"><div className="cd-field-label">Phone</div><div className="cd-field-value">{data.candidate.phone || '—'}</div></div>
              <div className="cd-field"><div className="cd-field-label">Joining Date</div><div className="cd-field-value">{new Date(data.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
              <div className="cd-field"><div className="cd-field-label">Probation</div><div className="cd-field-value">{data.probationMonths} months</div></div>
              <div className="cd-field"><div className="cd-field-label">Employment</div><div className="cd-field-value">{data.employmentType.replace(/_/g, ' ')}</div></div>
              <div className="cd-field"><div className="cd-field-label">Manager</div><div className="cd-field-value">{data.reportingManager?.displayName || '—'}</div></div>
              <div className="cd-field"><div className="cd-field-label">Pay Grade</div><div className="cd-field-value">{data.payGrade ? `${data.payGrade.code} — ${data.payGrade.label}` : '—'}</div></div>
              <div className="cd-field"><div className="cd-field-label">Location</div><div className="cd-field-value">{data.workLocation || '—'}</div></div>
            </div>
          </div>

          {data.status === 'JOINED' && (
            <div className="cd-section">
              <div className="cd-section-title">Conversion Gate</div>
              <div className="cd-convert-gate">
                <div className="cd-gate-item">
                  <div className={`cd-gate-icon ${data.offer?.status === 'accepted' ? 'pass' : 'fail'}`}>{data.offer?.status === 'accepted' ? 'Y' : 'N'}</div>
                  Offer accepted
                </div>
                <div className="cd-gate-item">
                  <div className={`cd-gate-icon ${data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? 'pass' : 'fail'}`}>
                    {data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? 'Y' : 'N'}
                  </div>
                  All mandatory docs verified
                </div>
                <div className="cd-gate-item">
                  <div className={`cd-gate-icon ${data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? 'pass' : 'fail'}`}>
                    {data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? 'Y' : 'N'}
                  </div>
                  All mandatory tasks complete
                </div>
              </div>
              <button className="cd-btn-sm primary" disabled={!data.readyToConvert || busy} onClick={convert}>Convert to Employee</button>
            </div>
          )}

          {data.status === 'PROBATION' && (
            <div className="cd-section">
              <div className="cd-section-title">Probation Actions</div>
              <div className="cd-actions">
                <button className="cd-btn-sm primary" disabled={busy} onClick={() => confirmAction('confirm')}>Confirm</button>
                <button className="cd-btn-sm" disabled={busy} onClick={() => confirmAction('extend')}>Extend</button>
                <button className="cd-btn-sm danger" disabled={busy} onClick={() => confirmAction('terminate')}>Terminate</button>
              </div>
            </div>
          )}

          <div className="cd-actions">
            {nextMoves.map(to => (
              <button key={to} className={`cd-btn-sm${to === 'CANCELLED' ? ' danger' : ''}`} disabled={busy} onClick={() => transition(to)}>
                {to.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'Offer' && (
        <div className="cd-section">
          <div className="cd-section-title">Offer</div>
          {data.offer ? (
            <>
              <div className="cd-grid" style={{ marginBottom: 16 }}>
                <div className="cd-field"><div className="cd-field-label">CTC (Annual)</div><div className="cd-field-value">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.offer.ctcAnnual)}</div></div>
                <div className="cd-field"><div className="cd-field-label">Status</div><div className="cd-field-value" style={{ textTransform: 'uppercase' }}>{data.offer.status}</div></div>
                <div className="cd-field"><div className="cd-field-label">Version</div><div className="cd-field-value">v{data.offer.version}</div></div>
              </div>
              {data.offer.componentsPreview.length > 0 && (
                <table className="cd-comp-table">
                  <thead><tr><th>Component</th><th>Type</th><th>Calc</th><th>Value</th></tr></thead>
                  <tbody>
                    {data.offer.componentsPreview.map((c, i) => (
                      <tr key={i}><td>{c.label}</td><td>{c.type}</td><td>{c.calc.replace(/_/g, ' ')}</td><td>{c.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {data.offer.status === 'draft' && (
                <div className="cd-actions"><button className="cd-btn-sm primary" disabled={busy} onClick={sendOffer}>Send Offer</button></div>
              )}
            </>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>No offer created yet.</p>
              <button className="cd-btn-sm primary" onClick={createOffer}>Create Offer</button>
            </div>
          )}
        </div>
      )}

      {tab === 'Tasks' && (
        <div className="cd-section">
          <div className="cd-section-title">Tasks ({data.tasks.filter(t => t.status === 'done').length}/{data.tasks.length} done)</div>
          {data.tasks.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No tasks. Assign a workflow template and transition to PRE_BOARDING.</div>
          ) : (
            data.tasks.map(t => (
              <div key={t._id} className="cd-task-row">
                <input type="checkbox" className="cd-task-check" checked={t.status === 'done'} disabled={t.status === 'done' || t.blocked} onChange={() => completeTask(t._id)} />
                <span className={`cd-task-title${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
                {t.assignedTo && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.assignedTo.displayName}</span>}
                {t.dueDate && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                <span className={`cd-task-badge ${t.blocked ? 'blocked' : t.status}`}>{t.blocked ? 'blocked' : t.status}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Documents' && (
        <div className="cd-section">
          <div className="cd-section-title">Documents</div>
          {data.documents.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No document requests. Transition to PRE_BOARDING to create them.</div>
          ) : (
            data.documents.map(d => (
              <div key={d._id} className="cd-doc-row">
                <div>
                  <div className="cd-doc-type">{d.docType.replace(/_/g, ' ')}</div>
                  {d.submission?.filename && (
                    <a href={`${API}/onboarding/documents/${d.submission.fileId}/download`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>{d.submission.filename}</a>
                  )}
                  {d.rejectionReason && <div style={{ fontSize: 11, color: '#dc2626' }}>Rejected: {d.rejectionReason}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`cd-doc-status ${d.verifyStatus}`}>{d.verifyStatus}</span>
                  {d.verifyStatus === 'submitted' && (
                    <>
                      <button className="cd-btn-sm primary" onClick={() => verifyDoc(d._id)}>Verify</button>
                      <button className="cd-btn-sm danger" onClick={() => rejectDoc(d._id)}>Reject</button>
                    </>
                  )}
                  {(d.verifyStatus === 'awaiting' || d.verifyStatus === 'rejected') && (
                    <button className="cd-btn-sm" onClick={() => triggerUpload(d._id)}>Upload</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/onboarding/CaseDetail.tsx web/src/onboarding/CaseDetail.css
git commit -m "feat(onboarding): add case detail page with overview, offer, tasks, documents tabs"
```

---

### Task 7: Frontend — My Onboarding Tasks + Template Builder

**Files:**
- Create: `web/src/onboarding/MyOnboardingTasks.tsx`
- Create: `web/src/onboarding/MyOnboardingTasks.css`
- Create: `web/src/onboarding/TemplateBuilder.tsx`
- Create: `web/src/onboarding/TemplateBuilder.css`

**Interfaces:**
- Consumes: `authed()` from `src/fetchHelper.ts`, `GET /onboarding/tasks/mine`, `POST /onboarding/tasks/:taskId/complete`, `GET /onboarding/templates`, `POST /onboarding/templates`, `PUT /onboarding/templates/:id` (Task 3)
- Produces: `MyOnboardingTasks`, `TemplateBuilder` components — used by Task 9

- [ ] **Step 1: Create MyOnboardingTasks**

Create `web/src/onboarding/MyOnboardingTasks.css`:

```css
.mot-page { padding: 28px 32px; max-width: 800px; }
.mot-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; }
.mot-list { display: flex; flex-direction: column; gap: 8px; }
.mot-item { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; box-shadow: var(--shadow); }
.mot-item-info { flex: 1; }
.mot-item-title { font-size: 14px; font-weight: 600; color: var(--text); }
.mot-item-case { font-size: 12px; color: var(--muted); }
.mot-item-due { font-size: 11px; color: var(--muted); }
.mot-empty { text-align: center; color: var(--faint); padding: 40px; font-size: 13px; }
```

Create `web/src/onboarding/MyOnboardingTasks.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './MyOnboardingTasks.css';

interface OTask {
  _id: string; title: string; ownerRole: string; status: string; dueDate: string;
  onboardingCase: { _id: string; candidate: { firstName: string; lastName: string }; designation: string; status: string; joiningDate: string };
}

export function MyOnboardingTasks() {
  const [tasks, setTasks] = useState<OTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    authed('/onboarding/tasks/mine').then(d => { setTasks(d); setLoaded(true); });
  }, []);

  async function complete(taskId: string) {
    await authed(`/onboarding/tasks/${taskId}/complete`, 'POST');
    setTasks(prev => prev.filter(t => t._id !== taskId));
  }

  if (!loaded) return <div className="mot-page"><div className="mot-empty">Loading...</div></div>;

  return (
    <div className="mot-page">
      <h1 className="mot-title">My Onboarding Tasks</h1>
      {tasks.length === 0 ? (
        <div className="mot-empty">No pending onboarding tasks.</div>
      ) : (
        <div className="mot-list">
          {tasks.map(t => (
            <div key={t._id} className="mot-item">
              <input type="checkbox" className="cd-task-check" onChange={() => complete(t._id)} />
              <div className="mot-item-info">
                <div className="mot-item-title">{t.title}</div>
                <div className="mot-item-case" style={{ cursor: 'pointer' }} onClick={() => navigate(`/onboarding/${t.onboardingCase._id}`)}>
                  {t.onboardingCase.candidate.firstName} {t.onboardingCase.candidate.lastName} — {t.onboardingCase.designation}
                </div>
              </div>
              {t.dueDate && <span className="mot-item-due">{new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create TemplateBuilder**

Create `web/src/onboarding/TemplateBuilder.css`:

```css
.tb-page { padding: 28px 32px; max-width: 900px; }
.tb-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }
.tb-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
.tb-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; box-shadow: var(--shadow); cursor: pointer; transition: border-color 0.12s; }
.tb-card:hover { border-color: var(--accent); }
.tb-card-name { font-size: 14px; font-weight: 600; color: var(--text); }
.tb-card-count { font-size: 12px; color: var(--muted); }

.tb-editor { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 26px; box-shadow: var(--shadow); }
.tb-task-row { display: grid; grid-template-columns: 1fr 1fr 100px 70px 70px 30px; gap: 8px; align-items: center; margin-bottom: 8px; }
.tb-task-row input, .tb-task-row select { font-size: 12px; }
.tb-empty { text-align: center; color: var(--faint); padding: 40px; font-size: 13px; }
```

Create `web/src/onboarding/TemplateBuilder.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './TemplateBuilder.css';

interface TemplateTask { key: string; title: string; ownerRole: string; offsetDays: number; category: string; mandatory: boolean; dependsOn: string[]; }
interface Template { _id: string; name: string; tasks: TemplateTask[]; }

const ROLES = ['hr', 'it', 'manager', 'finance', 'candidate', 'admin'];
const CATEGORIES = ['document', 'asset', 'access', 'training', 'admin'];

const emptyTask = (): TemplateTask => ({ key: '', title: '', ownerRole: 'hr', offsetDays: 0, category: 'admin', mandatory: true, dependsOn: [] });

export function TemplateBuilder() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [tasks, setTasks] = useState<TemplateTask[]>([]);

  useEffect(() => {
    authed('/onboarding/templates').then(d => { setTemplates(d); setLoaded(true); });
  }, []);

  function startEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setTasks([...t.tasks]);
  }

  function startNew() {
    setEditing({ _id: '', name: '', tasks: [] } as Template);
    setName('');
    setTasks([emptyTask()]);
  }

  function updateTask(idx: number, field: string, value: unknown) {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }

  function removeTask(idx: number) {
    setTasks(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const body = { name, tasks };
    if (editing?._id) {
      const updated = await authed(`/onboarding/templates/${editing._id}`, 'PUT', body);
      setTemplates(prev => prev.map(t => t._id === updated._id ? updated : t));
    } else {
      const created = await authed('/onboarding/templates', 'POST', body);
      setTemplates(prev => [created, ...prev]);
    }
    setEditing(null);
  }

  if (!loaded) return <div className="tb-page"><div className="tb-empty">Loading...</div></div>;

  if (editing) {
    return (
      <div className="tb-page">
        <div className="tb-title">
          <span>{editing._id ? 'Edit Template' : 'New Template'}</span>
        </div>
        <div className="tb-editor">
          <div style={{ marginBottom: 14 }}>
            <label className="ob-form-label">Template Name</label>
            <input className="se-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering FTE Onboarding" />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Tasks</div>
          <div className="tb-task-row" style={{ fontWeight: 700, fontSize: 11, color: 'var(--muted)' }}>
            <span>Key / Title</span><span>Owner / Category</span><span>Offset</span><span>Required</span><span></span><span></span>
          </div>
          {tasks.map((t, i) => (
            <div key={i} className="tb-task-row">
              <div>
                <input className="se-input" placeholder="key" value={t.key} onChange={e => updateTask(i, 'key', e.target.value)} style={{ marginBottom: 4 }} />
                <input className="se-input" placeholder="title" value={t.title} onChange={e => updateTask(i, 'title', e.target.value)} />
              </div>
              <div>
                <select className="se-select" value={t.ownerRole} onChange={e => updateTask(i, 'ownerRole', e.target.value)} style={{ marginBottom: 4 }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select className="se-select" value={t.category} onChange={e => updateTask(i, 'category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input className="se-input" type="number" value={t.offsetDays} onChange={e => updateTask(i, 'offsetDays', Number(e.target.value))} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="checkbox" checked={t.mandatory} onChange={e => updateTask(i, 'mandatory', e.target.checked)} /> Yes
              </label>
              <div />
              <button className="cd-btn-sm danger" style={{ padding: '4px 8px' }} onClick={() => removeTask(i)}>x</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="cd-btn-sm" onClick={() => setTasks(prev => [...prev, emptyTask()])}>+ Add Task</button>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="cd-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            <button className="cd-btn-sm primary" onClick={save} disabled={!name || tasks.length === 0}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tb-page">
      <div className="tb-title">
        <span>Onboarding Templates</span>
        <button className="pr-btn" onClick={startNew}>New Template</button>
      </div>
      {templates.length === 0 ? (
        <div className="tb-empty">No templates yet.</div>
      ) : (
        <div className="tb-list">
          {templates.map(t => (
            <div key={t._id} className="tb-card" onClick={() => startEdit(t)}>
              <div className="tb-card-name">{t.name}</div>
              <div className="tb-card-count">{t.tasks.length} tasks</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/onboarding/MyOnboardingTasks.tsx web/src/onboarding/MyOnboardingTasks.css web/src/onboarding/TemplateBuilder.tsx web/src/onboarding/TemplateBuilder.css
git commit -m "feat(onboarding): add My Onboarding Tasks queue and Template Builder UI"
```

---

### Task 8: Frontend — Candidate Portal

**Files:**
- Create: `web/src/onboarding/CandidatePortal.tsx`
- Create: `web/src/onboarding/CandidatePortal.css`

**Interfaces:**
- Consumes: Portal API at `/onboarding/portal/:token/*` (Task 4) — does NOT use `authed()`, uses raw `fetch()` since token is in the URL path, not a JWT
- Produces: `CandidatePortal` component — used by Task 9 (routed outside AppShell at `/portal/:token`)

- [ ] **Step 1: Create portal CSS**

Create `web/src/onboarding/CandidatePortal.css`:

```css
.cp-page { min-height: 100vh; background: var(--bg); display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
.cp-brand { font-size: 24px; font-weight: 800; color: var(--accent); margin-bottom: 32px; }
.cp-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px 32px; width: 100%; max-width: 600px; box-shadow: var(--shadow); margin-bottom: 16px; }
.cp-card-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
.cp-welcome { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.cp-sub { font-size: 13px; color: var(--muted); margin-bottom: 18px; }
.cp-field { margin-bottom: 10px; }
.cp-field-label { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 2px; }
.cp-field-value { font-size: 14px; color: var(--text); }

.cp-offer-ctc { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 14px; }
.cp-offer-actions { display: flex; gap: 12px; }

.cp-checklist { list-style: none; padding: 0; margin: 0; }
.cp-checklist li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
.cp-checklist li:last-child { border-bottom: none; }
.cp-check { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.cp-check.done { background: rgba(34,197,94,0.12); color: #15803d; }
.cp-check.pending { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }

.cp-doc-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); }
.cp-doc-row:last-child { border-bottom: none; }
.cp-doc-type { font-size: 13px; font-weight: 600; color: var(--text); text-transform: uppercase; }
.cp-doc-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; }
.cp-doc-badge.awaiting { background: var(--bg); color: var(--muted); }
.cp-doc-badge.submitted { background: rgba(234,179,8,0.12); color: #b45309; }
.cp-doc-badge.verified { background: rgba(34,197,94,0.12); color: #15803d; }
.cp-doc-badge.rejected { background: rgba(239,68,68,0.12); color: #dc2626; }

.cp-error { color: #dc2626; font-size: 14px; text-align: center; padding: 40px; }
.cp-loading { color: var(--muted); font-size: 14px; text-align: center; padding: 40px; }
```

- [ ] **Step 2: Create the CandidatePortal component**

Create `web/src/onboarding/CandidatePortal.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './CandidatePortal.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Checklist {
  status: string;
  candidate: { firstName: string; lastName: string; personalEmail: string };
  designation: string;
  joiningDate: string;
  offer: { ctcAnnual: number; status: string; joiningDate: string; expiryDate: string } | null;
  tasks: { key: string; title: string; status: string; dueDate: string }[];
  documents: { _id: string; docType: string; mandatory: boolean; verifyStatus: string; hasSubmission: boolean }[];
}

async function portalFetch(token: string, path: string, method = 'GET', body?: unknown) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}/onboarding/portal/${token}${path}`, opts);
  return r.json();
}

async function portalUpload(token: string, path: string, formData: FormData) {
  const r = await fetch(`${API}/onboarding/portal/${token}${path}`, { method: 'POST', body: formData });
  return r.json();
}

export function CandidatePortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Checklist | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocId, setUploadDocId] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    portalFetch(token, '/checklist').then(d => {
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(load, [token]);

  async function acceptOffer() {
    if (!token) return;
    setBusy(true);
    await portalFetch(token, '/accept-offer', 'POST');
    await load();
    setBusy(false);
  }

  async function declineOffer() {
    if (!token) return;
    const reason = prompt('Reason for declining (optional):') || '';
    setBusy(true);
    await portalFetch(token, '/decline-offer', 'POST', { reason });
    await load();
    setBusy(false);
  }

  async function completeTask(key: string) {
    if (!token) return;
    await portalFetch(token, `/tasks/${key}/complete`, 'POST');
    await load();
  }

  function triggerUpload(docId: string) {
    setUploadDocId(docId);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadDocId || !token) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docId', uploadDocId);
    await portalUpload(token, '/documents', fd);
    e.target.value = '';
    setUploadDocId(null);
    await load();
  }

  if (error) return <div className="cp-page"><div className="cp-error">{error}</div></div>;
  if (!data) return <div className="cp-page"><div className="cp-loading">Loading...</div></div>;

  const isTerminal = ['OFFER_DECLINED', 'CANCELLED'].includes(data.status);

  return (
    <div className="cp-page">
      <div className="cp-brand">Onboarding Portal</div>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} />

      <div className="cp-card">
        <div className="cp-welcome">Welcome, {data.candidate.firstName}!</div>
        <div className="cp-sub">{data.designation} — Joining {new Date(data.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        {isTerminal && <div style={{ color: '#dc2626', fontWeight: 600, fontSize: 14 }}>This case is {data.status.replace(/_/g, ' ').toLowerCase()}.</div>}
      </div>

      {data.offer && !isTerminal && (
        <div className="cp-card">
          <div className="cp-card-title">Offer</div>
          <div className="cp-offer-ctc">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.offer.ctcAnnual)} / year</div>
          <div className="cp-field"><div className="cp-field-label">Status</div><div className="cp-field-value" style={{ textTransform: 'uppercase' }}>{data.offer.status}</div></div>
          {data.offer.status === 'sent' && (
            <div className="cp-offer-actions" style={{ marginTop: 14 }}>
              <button className="pr-btn" disabled={busy} onClick={acceptOffer}>Accept Offer</button>
              <button className="cd-btn-sm danger" disabled={busy} onClick={declineOffer}>Decline</button>
            </div>
          )}
        </div>
      )}

      {!isTerminal && data.documents.length > 0 && (
        <div className="cp-card">
          <div className="cp-card-title">Documents</div>
          {data.documents.map(d => (
            <div key={d._id} className="cp-doc-row">
              <div>
                <span className="cp-doc-type">{d.docType.replace(/_/g, ' ')}</span>
                {d.mandatory && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 6 }}>Required</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`cp-doc-badge ${d.verifyStatus}`}>{d.verifyStatus}</span>
                {(d.verifyStatus === 'awaiting' || d.verifyStatus === 'rejected') && (
                  <button className="cd-btn-sm" onClick={() => triggerUpload(d._id)}>Upload</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isTerminal && data.tasks.length > 0 && (
        <div className="cp-card">
          <div className="cp-card-title">Tasks</div>
          <ul className="cp-checklist">
            {data.tasks.map(t => (
              <li key={t.key}>
                <div className={`cp-check ${t.status === 'done' ? 'done' : 'pending'}`}>{t.status === 'done' ? 'Y' : ' '}</div>
                <span style={{ flex: 1 }}>{t.title}</span>
                {t.status !== 'done' && <button className="cd-btn-sm" onClick={() => completeTask(t.key)}>Complete</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/onboarding/CandidatePortal.tsx web/src/onboarding/CandidatePortal.css
git commit -m "feat(onboarding): add standalone candidate self-service portal UI"
```

---

### Task 9: Wire Up Navigation + Routes

**Files:**
- Modify: `web/src/pm/nav.ts` (add nav keys + section items)
- Modify: `web/src/AppShell.tsx` (add imports, routes, nav icons)
- Modify: `web/src/App.tsx` (add portal route outside AppShell)
- Modify: `web/src/onboarding/index.ts` (verify exports)

**Interfaces:**
- Consumes: All components from Tasks 5-8
- Produces: Complete navigation and routing for the onboarding module

- [ ] **Step 1: Update nav.ts — add nav keys**

In `web/src/pm/nav.ts`, update the `NavKey` type to include `'onboarding' | 'onboarding-tasks' | 'onboarding-templates'`:

On line 2, replace the `NavKey` type:

```ts
export type NavKey = 'home' | 'users' | 'skills' | 'departments' | 'shifts' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization' | 'my-team' | 'team-attendance' | 'organisation' | 'profile' | 'payroll' | 'my-payslips' | 'reimbursements' | 'declarations' | 'tax-summary' | 'reimbursement-approvals' | 'onboarding' | 'onboarding-tasks' | 'onboarding-templates';
```

Update `ALL_NAV_KEYS` on line 6 to add the three new keys at the end:

```ts
const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'departments', 'shifts', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'utilization', 'my-team', 'team-attendance', 'organisation', 'profile', 'payroll', 'my-payslips', 'reimbursements', 'declarations', 'tax-summary', 'reimbursement-approvals', 'onboarding', 'onboarding-tasks', 'onboarding-templates'];
```

In the `sectionsForRole` function, add "Onboarding" to the People section (after the `organisation` push, around line 33):

```ts
    if (['admin', 'hr'].includes(role)) {
      people.push(I('onboarding', 'Onboarding'), I('onboarding-templates', 'Onboarding Templates'));
    }
```

In the Work section (after timesheet items are pushed), add onboarding-tasks for all non-employee roles that could be task assignees:

```ts
    // Inside each work section block, after existing items but before sections.push:
    if (['admin', 'pm', 'hr', 'reporting_manager', 'team_lead', 'finance', 'director', 'vp'].includes(role)) {
      // Add to the work items array before pushing the section
    }
```

More precisely: in the first `if` block for work (line 37-42), before `sections.push`, add:

```ts
    work.push(I('onboarding-tasks', 'Onboarding Tasks'));
```

And in the `else if` block for RM/team_lead (line 43-44), add `I('onboarding-tasks', 'Onboarding Tasks')` to the items array.

- [ ] **Step 2: Update AppShell.tsx — add imports, icons, routes**

In `web/src/AppShell.tsx`:

Add import after the payroll import (line 26):

```ts
import { OnboardingBoard, CaseDetail, MyOnboardingTasks, TemplateBuilder } from './onboarding/index';
```

Add NAV_ICONS entries (inside the `NAV_ICONS` object, after `'reimbursement-approvals'`):

```ts
  onboarding: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />,
  'onboarding-tasks': <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  'onboarding-templates': <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6" />,
```

Add routes (inside `<Routes>`, before the catch-all `*` route):

```tsx
          <Route path="/onboarding" element={<OnboardingBoard />} />
          <Route path="/onboarding/:id" element={<CaseDetail />} />
          <Route path="/onboarding-tasks" element={<MyOnboardingTasks />} />
          <Route path="/onboarding-templates" element={<TemplateBuilder />} />
```

- [ ] **Step 3: Update App.tsx — add portal route outside AppShell**

Find `web/src/App.tsx` and add the portal route. The portal must render OUTSIDE the AppShell (no sidebar). Add a Route for `/portal/:token` that renders `CandidatePortal` outside the authenticated shell.

Look at how `App.tsx` is structured — the portal route should be added before the AppShell route so it matches first:

```tsx
import { CandidatePortal } from './onboarding/CandidatePortal';
```

Add a Route:

```tsx
<Route path="/portal/:token" element={<CandidatePortal />} />
```

This must be placed at the same level as (or before) the AppShell route, not inside it.

- [ ] **Step 4: Verify the dev server compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors. If there are type errors, fix them.

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/nav.ts web/src/AppShell.tsx web/src/App.tsx web/src/onboarding/index.ts
git commit -m "feat(onboarding): wire up navigation, routing, and candidate portal route"
```

---

### Task 10: Seed Data + Smoke Test

**Files:**
- Modify: `auth-api/scripts/seed-all.js` (add onboarding seed data)

**Interfaces:**
- Consumes: `OnboardingCase` (Task 1), `Offer` (Task 2), `OnboardingTemplate` (Task 2), `OnboardingTask` (Task 2), `DocumentRequest` (Task 2)
- Produces: Test data to exercise all onboarding states in the UI

- [ ] **Step 1: Add onboarding seed data to seed-all.js**

At the top of `auth-api/scripts/seed-all.js`, add imports:

```js
import { OnboardingCase } from '../src/models/OnboardingCase.js';
import { Offer } from '../src/models/Offer.js';
import { OnboardingTemplate } from '../src/models/OnboardingTemplate.js';
import { OnboardingTask } from '../src/models/OnboardingTask.js';
import { DocumentRequest } from '../src/models/DocumentRequest.js';
```

Before the summary section at the end, add the onboarding seed block:

```js
  // ── Onboarding ────────────────────────────────────────────
  await OnboardingCase.deleteMany({});
  await Offer.deleteMany({});
  await OnboardingTemplate.deleteMany({});
  await OnboardingTask.deleteMany({});
  await DocumentRequest.deleteMany({});

  const hrUser = users.find(u => u.roles.includes('hr')) || users[0];
  const managerUser = users.find(u => u.roles.includes('reporting_manager')) || users[1];

  const template = await OnboardingTemplate.create({
    name: 'Engineering FTE Onboarding',
    appliesTo: { employmentType: 'full_time' },
    tasks: [
      { key: 'provision_laptop', title: 'Provision laptop', ownerRole: 'it', offsetDays: -3, category: 'asset', mandatory: true, dependsOn: [] },
      { key: 'setup_email', title: 'Create email account', ownerRole: 'it', offsetDays: -2, category: 'access', mandatory: true, dependsOn: ['provision_laptop'] },
      { key: 'id_card', title: 'Prepare ID card', ownerRole: 'hr', offsetDays: -1, category: 'admin', mandatory: true, dependsOn: [] },
      { key: 'welcome_kit', title: 'Prepare welcome kit', ownerRole: 'hr', offsetDays: 0, category: 'admin', mandatory: false, dependsOn: [] },
      { key: 'team_intro', title: 'Schedule team introduction', ownerRole: 'manager', offsetDays: 0, category: 'training', mandatory: true, dependsOn: [] },
      { key: 'read_handbook', title: 'Read employee handbook', ownerRole: 'candidate', offsetDays: -5, category: 'document', mandatory: true, dependsOn: [] },
      { key: 'bank_details', title: 'Submit bank details', ownerRole: 'candidate', offsetDays: -3, category: 'document', mandatory: true, dependsOn: [] },
    ],
  });

  const candidates = [
    { firstName: 'Priya', lastName: 'Sharma', personalEmail: 'priya.sharma@gmail.com', phone: '9876543210', designation: 'Senior Engineer', status: 'DRAFT' },
    { firstName: 'Arjun', lastName: 'Patel', personalEmail: 'arjun.patel@gmail.com', phone: '9876543211', designation: 'Product Manager', status: 'OFFER_SENT' },
    { firstName: 'Neha', lastName: 'Gupta', personalEmail: 'neha.gupta@gmail.com', phone: '9876543212', designation: 'UX Designer', status: 'OFFER_ACCEPTED' },
    { firstName: 'Rahul', lastName: 'Kumar', personalEmail: 'rahul.kumar@gmail.com', phone: '9876543213', designation: 'Frontend Developer', status: 'PRE_BOARDING' },
    { firstName: 'Ananya', lastName: 'Singh', personalEmail: 'ananya.singh@gmail.com', phone: '9876543214', designation: 'Data Analyst', status: 'JOINED' },
    { firstName: 'Vikram', lastName: 'Reddy', personalEmail: 'vikram.reddy@gmail.com', phone: '9876543215', designation: 'Backend Engineer', status: 'INDUCTION' },
    { firstName: 'Deepa', lastName: 'Nair', personalEmail: 'deepa.nair@gmail.com', phone: '9876543216', designation: 'QA Lead', status: 'PROBATION' },
  ];

  for (const cand of candidates) {
    const joiningDate = new Date('2026-08-01');
    const c = await OnboardingCase.create({
      candidate: { firstName: cand.firstName, lastName: cand.lastName, personalEmail: cand.personalEmail, phone: cand.phone },
      designation: cand.designation,
      reportingManager: managerUser._id,
      joiningDate,
      probationMonths: 3,
      employmentType: 'full_time',
      workflowTemplate: template._id,
      status: cand.status,
      createdBy: hrUser._id,
    });

    if (['OFFER_SENT', 'OFFER_ACCEPTED', 'PRE_BOARDING', 'JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status)) {
      const offerStatus = cand.status === 'OFFER_SENT' ? 'sent'
        : ['OFFER_DECLINED'].includes(cand.status) ? 'declined'
        : 'accepted';
      await Offer.create({
        onboardingCase: c._id,
        ctcAnnual: 1200000 + Math.floor(Math.random() * 800000),
        componentsPreview: [
          { key: 'basic', label: 'Basic', type: 'earning', calc: 'percent_of_ctc', value: 50, taxable: true, proratable: true },
          { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 40, taxable: true, proratable: true },
          { key: 'pf', label: 'PF (Employer)', type: 'deduction', calc: 'percent_of_basic', value: 12, taxable: false, proratable: true },
        ],
        joiningDate,
        status: offerStatus,
        sentAt: new Date(),
        respondedAt: offerStatus !== 'sent' ? new Date() : null,
      });
    }

    if (['PRE_BOARDING', 'JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status)) {
      const defaultDocs = ['pan', 'aadhaar', 'bank_proof', 'photo', 'education'];
      for (const docType of defaultDocs) {
        const mandatory = ['pan', 'aadhaar', 'bank_proof', 'photo'].includes(docType);
        const isVerified = ['JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status) && mandatory;
        await DocumentRequest.create({
          onboardingCase: c._id,
          docType,
          mandatory,
          verifyStatus: isVerified ? 'verified' : (cand.status !== 'PRE_BOARDING' && mandatory ? 'submitted' : 'awaiting'),
          ...(isVerified ? { verifiedBy: hrUser._id, verifiedAt: new Date() } : {}),
        });
      }

      for (const t of template.tasks) {
        const isDone = ['JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status);
        await OnboardingTask.create({
          onboardingCase: c._id,
          templateKey: t.key,
          title: t.title,
          ownerRole: t.ownerRole,
          assignedTo: t.ownerRole === 'manager' ? managerUser._id : (t.ownerRole === 'hr' ? hrUser._id : null),
          dueDate: new Date(joiningDate.getTime() + t.offsetDays * 86400000),
          dependsOn: t.dependsOn,
          mandatory: t.mandatory,
          status: isDone ? 'done' : 'pending',
          ...(isDone ? { completedAt: new Date(), completedBy: hrUser._id } : {}),
        });
      }
    }
  }

  console.log('  Onboarding: 7 cases, 1 template, tasks + docs per case');
```

- [ ] **Step 2: Run the seed**

```bash
cd auth-api && node scripts/seed-all.js
```

Expected: seed completes with "Onboarding: 7 cases, 1 template..." in output.

- [ ] **Step 3: Start dev server and verify the board loads**

Start the auth-api and web dev servers (if not running), then open `http://localhost:5175/onboarding` in a browser. Verify:
- Kanban columns show cases in DRAFT, OFFER_SENT, OFFER_ACCEPTED, PRE_BOARDING, JOINED, INDUCTION, PROBATION
- Clicking a card opens the case detail page
- Tabs (Overview, Offer, Tasks, Documents) show data

- [ ] **Step 4: Commit**

```bash
git add auth-api/scripts/seed-all.js
git commit -m "feat(onboarding): add seed data for onboarding cases, offers, tasks, docs"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | OnboardingCase model + state machine | 1 create |
| 2 | Offer, Template, Task, DocumentRequest models | 4 create |
| 3 | Onboarding API routes (cases, offers, tasks, docs, conversion, confirmation) | 1 create, 1 modify |
| 4 | Candidate portal API (token-scoped) | 1 create, 1 modify |
| 5 | Onboarding Board (Kanban UI) | 3 create |
| 6 | Case Detail page (tabbed) | 2 create |
| 7 | My Onboarding Tasks + Template Builder | 4 create |
| 8 | Candidate Portal UI | 2 create |
| 9 | Wire up navigation + routes | 4 modify |
| 10 | Seed data + smoke test | 1 modify |
