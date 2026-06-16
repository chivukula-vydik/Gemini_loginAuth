import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';

export function createUsersRouter() {
  const router = express.Router();

  router.get('/', requireAuth, requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const users = await User.find({ active: { $ne: false } }).select('displayName email').sort('displayName');
    res.json(users);
  }));

  return router;
}
