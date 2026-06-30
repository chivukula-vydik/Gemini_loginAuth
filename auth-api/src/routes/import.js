import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getTemplateCSV, parseCSV, parseXLSX,
  autoMapColumns, dryRun, commitImport, rollbackBatch,
} from '../services/rosterImport.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

export function createImportRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('admin'));

  // Download template CSV
  router.get('/template', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="roster-template.csv"');
    res.send(getTemplateCSV());
  });

  // Upload + parse + auto-map (no writes)
  router.post('/parse', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

    const name = req.file.originalname.toLowerCase();
    let parsed;
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      parsed = parseXLSX(req.file.buffer);
    } else {
      parsed = parseCSV(req.file.buffer.toString('utf-8'));
    }

    if (parsed.data.length === 0) {
      return res.status(400).json({ error: 'file is empty or has no data rows' });
    }

    const mapping = autoMapColumns(parsed.headers);
    res.json({
      headers: parsed.headers,
      mapping,
      rowCount: parsed.data.length,
      sampleRows: parsed.data.slice(0, 5), // preview first 5 rows
    });
  }));

  // Dry-run validation (no writes)
  router.post('/dry-run', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const customMapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;

    const name = req.file.originalname.toLowerCase();
    let parsed;
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      parsed = parseXLSX(req.file.buffer);
    } else {
      parsed = parseCSV(req.file.buffer.toString('utf-8'));
    }

    const mapping = customMapping || autoMapColumns(parsed.headers);
    const report = dryRun(parsed.data, mapping);
    res.json(report);
  }));

  // Commit import
  router.post('/commit', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const customMapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;

    const name = req.file.originalname.toLowerCase();
    let parsed;
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      parsed = parseXLSX(req.file.buffer);
    } else {
      parsed = parseCSV(req.file.buffer.toString('utf-8'));
    }

    const mapping = customMapping || autoMapColumns(parsed.headers);

    // Run validation first
    const validation = dryRun(parsed.data, mapping);
    if (!validation.valid) {
      return res.status(400).json({ error: 'validation failed — fix errors before committing', ...validation });
    }

    const result = await commitImport(parsed.data, mapping);
    // File buffer is in memory only — GC'd after response, never persisted
    res.json(result);
  }));

  // Rollback a batch
  router.delete('/batch/:batchId', asyncHandler(async (req, res) => {
    const result = await rollbackBatch(req.params.batchId);
    res.json(result);
  }));

  return router;
}
