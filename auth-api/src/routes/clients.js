import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Client } from '../models/Client.js';
import { Project } from '../models/Project.js';

export function createClientsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(async (req, res) => {
    const clients = await Client.find().sort('name');
    res.json(clients);
  }));

  router.post('/', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const { name, contactName, contactEmail } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const client = await Client.create({
      name: String(name).trim(),
      contactName: String(contactName || ''),
      contactEmail: String(contactEmail || ''),
    });
    res.status(201).json(client);
  }));

  router.patch('/:id', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'not found' });
    for (const f of ['name', 'contactName', 'contactEmail', 'status']) {
      if (f in (req.body || {})) client[f] = req.body[f];
    }
    await client.save();
    res.json(client);
  }));

  router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const inUse = await Project.exists({ clientId: req.params.id });
    if (inUse) return res.status(409).json({ error: 'client is referenced by at least one project' });
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'not found' });
    await client.deleteOne();
    res.json({ ok: true });
  }));

  return router;
}
