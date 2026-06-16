import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Skill } from '../models/Skill.js';

export function createSkillsRouter() {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const skills = await Skill.find({ active: true }).sort('name');
    res.json(skills);
  }));

  return router;
}
