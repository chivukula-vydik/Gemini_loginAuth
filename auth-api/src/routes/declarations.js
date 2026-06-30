import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { InvestmentDeclaration } from '../models/InvestmentDeclaration.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { resolveMonthlyAmounts } from '../services/payrollEngine.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function getProofBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'declarationProofs' });
}

const SECTION_LIMITS = {
  '80C':       150000,
  '80D':       100000, // senior citizen; 25000 for non-senior — we use the higher cap, HR verifies
  '80E':       Infinity,
  '80G':       Infinity,
  '24B':       200000,
  '80CCD(1B)': 50000,
  '80TTA':     10000,
  '80DDB':     100000,
  '80U':       125000,
  '80EEB':     150000,
  'NPS_EMPLOYER': 750000,
};

const OLD_REGIME_ONLY_SECTIONS = ['80C', '80D', '80E', '80G', 'HRA', '24B', '80CCD(1B)', '80TTA', '80DDB', '80U', '80EEB'];

function validateItems(items, regime) {
  const errors = [];
  const loanSections = ['24B', '80E', '80EEB'];
  for (const item of items) {
    const limit = SECTION_LIMITS[item.section];
    if (limit === undefined) {
      errors.push(`unknown section: ${item.section}`);
    } else if (item.declaredAmount < 0) {
      errors.push(`${item.section}: amount cannot be negative`);
    } else if (limit !== Infinity && item.declaredAmount > limit) {
      errors.push(`${item.section}: exceeds limit of ₹${limit.toLocaleString('en-IN')}`);
    }
    if (regime === 'new' && loanSections.includes(item.section)) {
      errors.push(`${item.section}: loan interest deductions are not available under the New Tax Regime`);
    }
  }
  return errors;
}

function computeHraExemption(hraDetail, basicMonthly, hraMonthly) {
  if (!hraDetail || !hraDetail.monthlyRent || hraDetail.monthlyRent <= 0) return 0;
  const annualRent = hraDetail.monthlyRent * 12;
  const annualBasic = basicMonthly * 12;
  const annualHra = hraMonthly * 12;
  const metroPercent = hraDetail.isMetro ? 50 : 40;
  const exemption = Math.min(
    annualHra,
    annualRent - 0.10 * annualBasic,
    (metroPercent / 100) * annualBasic,
  );
  return Math.max(0, Math.round(exemption));
}

export function createDeclarationsRouter() {
  const router = express.Router();

  // ── Employee: get own declaration ─────────────────────────────────────
  router.get('/:fy/me', requireAuth, asyncHandler(async (req, res) => {
    const dec = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    if (!dec) return res.json(null);

    let hraExemption = 0;
    if (dec.regime === 'old' && dec.hraDetail?.monthlyRent > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const salary = await SalaryStructure.findOne({ user: req.user.sub, effectiveFrom: { $lte: today } }).sort('-effectiveFrom');
      if (salary) {
        const resolved = resolveMonthlyAmounts(salary.components, salary.ctcAnnual);
        const basicComp = resolved.find(c => c.key === 'basic');
        const hraComp = resolved.find(c => c.key === 'hra');
        hraExemption = computeHraExemption(dec.hraDetail, basicComp?.monthlyAmount || 0, hraComp?.monthlyAmount || 0);
      }
    }

    res.json({ ...dec.toObject(), hraExemption });
  }));

  // ── Employee: save / update declaration ────────────────────────────────
  router.post('/:fy', requireAuth, asyncHandler(async (req, res) => {
    const { regime, items, hraDetail } = req.body;
    if (!regime) return res.status(400).json({ error: 'regime required' });

    const existing = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    if (existing?.lockedForTds) return res.status(400).json({ error: 'declaration locked for TDS' });
    if (existing?.phase === 'closed') return res.status(400).json({ error: 'declaration is closed for this FY' });

    if (items) {
      const errors = validateItems(items, regime);
      if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    }

    if (existing) {
      existing.regime = regime;
      if (items !== undefined) existing.items = items;
      if (hraDetail !== undefined) existing.hraDetail = hraDetail;
      await existing.save();
      return res.json(existing);
    }

    const dec = await InvestmentDeclaration.create({
      user: req.user.sub,
      financialYear: req.params.fy,
      regime,
      items: items || [],
      hraDetail: hraDetail || null,
    });
    res.status(201).json(dec);
  }));

  // ── Employee: upload proof for an item ─────────────────────────────────
  router.post('/:fy/proof/:sectionIdx', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
    const dec = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    if (!dec) return res.status(404).json({ error: 'declaration not found' });
    if (dec.phase === 'closed') return res.status(400).json({ error: 'declaration is closed' });

    if (dec.regime === 'new' && ['24B', '80E', '80EEB'].includes(dec.items[Number(req.params.sectionIdx)]?.section)) {
      return res.status(400).json({ error: 'loan deduction proofs cannot be uploaded under New Tax Regime' });
    }

    const idx = Number(req.params.sectionIdx);
    if (!dec.items[idx]) return res.status(400).json({ error: 'invalid item index' });
    if (!req.file) return res.status(400).json({ error: 'file required' });

    const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'only PDF or image files accepted — upload official certificates, not raw bank statements' });
    }

    const bucket = getProofBucket();
    const stream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { user: req.user.sub, fy: req.params.fy, section: dec.items[idx].section },
    });
    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);
    readable.pipe(stream);
    await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });

    dec.items[idx].proofs.push({
      fileId: stream.id,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
    });
    dec.items[idx].verifyStatus = 'pending';
    await dec.save();
    res.json(dec);
  }));

  // ── Employee: submit proofs (transition declaration → proof phase) ─────
  router.post('/:fy/submit-proofs', requireAuth, asyncHandler(async (req, res) => {
    const dec = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    if (!dec) return res.status(404).json({ error: 'declaration not found' });
    if (dec.phase !== 'declaration') return res.status(400).json({ error: `cannot submit proofs in phase: ${dec.phase}` });

    dec.phase = 'proof';
    await dec.save();
    res.json(dec);
  }));

  // ── Download proof — employee (own) + admin/finance/hr only ────────────
  router.get('/:fy/proof/:fileId', requireAuth, asyncHandler(async (req, res) => {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const bucket = getProofBucket();
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).json({ error: 'file not found' });

    const meta = files[0].metadata || {};
    const isOwner = meta.user === req.user.sub;
    const isPrivileged = ['admin', 'finance', 'hr'].some(r => (req.user.roles || []).includes(r));
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ error: 'access denied — only the employee or HR/payroll admins may view proof documents' });
    }

    res.set('Content-Type', files[0].contentType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${files[0].filename}"`);
    bucket.openDownloadStream(fileId).pipe(res);
  }));

  // ── Section limits reference ───────────────────────────────────────────
  router.get('/limits', requireAuth, (req, res) => {
    res.json(SECTION_LIMITS);
  });

  // ── HR/Finance: list all declarations for a FY ─────────────────────────
  router.get('/:fy/all', requireAuth, requireRole('admin', 'finance', 'hr'), asyncHandler(async (req, res) => {
    const decs = await InvestmentDeclaration.find({ financialYear: req.params.fy })
      .populate('user', 'firstName lastName email')
      .sort('-updatedAt');
    res.json(decs);
  }));

  // ── HR/Finance: verify or reject an item ──────────────────────────────
  router.patch('/:fy/verify/:userId/:sectionIdx', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const { action, proofAmount, rejectReason } = req.body;
    if (!['verify', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be verify or reject' });

    const dec = await InvestmentDeclaration.findOne({ user: req.params.userId, financialYear: req.params.fy });
    if (!dec) return res.status(404).json({ error: 'declaration not found' });

    const idx = Number(req.params.sectionIdx);
    if (!dec.items[idx]) return res.status(400).json({ error: 'invalid item index' });

    if (action === 'verify') {
      dec.items[idx].verifyStatus = 'verified';
      dec.items[idx].proofAmount = proofAmount ?? dec.items[idx].declaredAmount;
      dec.items[idx].rejectReason = '';
    } else {
      dec.items[idx].verifyStatus = 'rejected';
      dec.items[idx].rejectReason = rejectReason || '';
    }
    await dec.save();
    res.json(dec);
  }));

  // ── HR/Finance: close declaration (lock + transition to closed) ────────
  router.post('/:fy/close/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const dec = await InvestmentDeclaration.findOne({ user: req.params.userId, financialYear: req.params.fy });
    if (!dec) return res.status(404).json({ error: 'declaration not found' });

    dec.phase = 'closed';
    dec.lockedForTds = true;
    await dec.save();
    res.json(dec);
  }));

  // ── HR/Finance: bulk close all declarations for FY ─────────────────────
  router.post('/:fy/close-all', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const result = await InvestmentDeclaration.updateMany(
      { financialYear: req.params.fy, phase: { $ne: 'closed' } },
      { $set: { phase: 'closed', lockedForTds: true } },
    );
    res.json({ closed: result.modifiedCount });
  }));

  return router;
}
