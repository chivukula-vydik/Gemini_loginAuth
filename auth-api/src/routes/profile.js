import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { Skill } from '../models/Skill.js';

export function createProfileRouter() {
  const router = express.Router();

  router.patch('/skills', requireAuth, asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.skillIds) ? req.body.skillIds : [];
    const valid = await Skill.find({ _id: { $in: ids }, active: true }).select('_id');
    const validIds = valid.map((s) => s._id);
    const user = await User.findByIdAndUpdate(req.user.sub, { skills: validIds }, { new: true })
      .select('email displayName role skills');
    res.json(user);
  }));

  return router;
}
