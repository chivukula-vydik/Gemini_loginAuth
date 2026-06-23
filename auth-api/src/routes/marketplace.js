import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { skillsMatch } from '../services/match.js';

export function createMarketplaceRouter() {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const me = await User.findById(req.user.sub).select('skills');
    const mySkills = (me?.skills || []).map(String);
    // Open to the whole company: any non-archived project's unassigned tasks are
    // claimable by anyone whose skills match — membership is not required.
    const projects = await Project.find({ status: { $ne: 'archived' } }).select('_id name');
    const projNameById = new Map(projects.map((p) => [String(p._id), p.name]));
    const tasks = await Task.find({
      project: { $in: projects.map((p) => p._id) },
      assignees: { $size: 0 },
      status: { $ne: 'done' },
    }).populate('requiredSkills', 'name').sort('-createdAt');

    const matched = tasks.filter((t) => skillsMatch(t.requiredSkills.map((s) => s._id), mySkills));

    const myPending = await ClaimRequest.find({
      userId: req.user.sub, status: 'pending', taskId: { $in: matched.map((t) => t._id) },
    }).select('taskId');
    const pendingSet = new Set(myPending.map((c) => String(c.taskId)));

    res.json(matched.map((t) => ({
      _id: t._id,
      title: t.title,
      description: t.description || '',
      project: projNameById.get(String(t.project)) || '',
      requiredSkills: t.requiredSkills.map((s) => s.name),
      estimatedHours: t.estimatedHours,
      myClaimStatus: pendingSet.has(String(t._id)) ? 'pending' : 'none',
    })));
  }));

  return router;
}
