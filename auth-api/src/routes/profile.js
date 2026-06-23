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

  router.get('/target', requireAuth, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub).select('weeklyTargetMinutes');
    const orgDefault = req.app.locals.weeklyTargetMinutes ?? 2400;
    const targetMinutes = user?.weeklyTargetMinutes ?? orgDefault;
    res.json({ targetMinutes });
  }));

  router.patch('/target', requireAuth, asyncHandler(async (req, res) => {
    const value = req.body?.weeklyTargetMinutes;
    const weeklyTargetMinutes = value === null ? null : (Number(value) || null);
    await User.updateOne({ _id: req.user.sub }, { $set: { weeklyTargetMinutes } });
    const orgDefault = req.app.locals.weeklyTargetMinutes ?? 2400;
    res.json({ targetMinutes: weeklyTargetMinutes ?? orgDefault });
  }));

  return router;
}
