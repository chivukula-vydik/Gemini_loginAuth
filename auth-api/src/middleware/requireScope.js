import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { Leave } from '../models/Leave.js';

function getTargetUserId(req) {
  return req.params.userId || req.body?.userId || null;
}

export const requireScope = {
  reportingLine() {
    return async (req, res, next) => {
      const targetId = getTargetUserId(req);
      if (!targetId) return next();
      const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      const ids = teamMembers.map((u) => String(u._id));
      if (!ids.includes(String(targetId))) {
        return res.status(404).json({ error: 'not found' });
      }
      next();
    };
  },

  projectMember() {
    return async (req, res, next) => {
      const targetId = getTargetUserId(req);
      if (!targetId) return next();
      const projects = await Project.find({
        $or: [{ ownerPm: req.user.sub }, { members: req.user.sub }],
      }).select('members ownerPm');
      const projectUserIds = new Set();
      for (const p of projects) {
        for (const m of (p.members || [])) projectUserIds.add(String(m));
        if (p.ownerPm) projectUserIds.add(String(p.ownerPm));
      }
      if (!projectUserIds.has(String(targetId))) {
        return res.status(404).json({ error: 'not found' });
      }
      next();
    };
  },
};

export async function isRmGateActive(rmUserId) {
  if (!rmUserId) return true;
  const rm = await User.findById(rmUserId);
  if (!rm) return true;
  if (!rm.active) return true;

  const today = new Date();
  const fiveWorkingDaysAgo = new Date(today);
  fiveWorkingDaysAgo.setDate(fiveWorkingDaysAgo.getDate() - 7);
  const extendedLeave = await Leave.findOne({
    userId: rmUserId,
    status: 'approved',
    startDate: { $lte: today.toISOString().slice(0, 10) },
    endDate: { $gte: fiveWorkingDaysAgo.toISOString().slice(0, 10) },
  });
  if (extendedLeave) {
    const start = new Date(extendedLeave.startDate + 'T00:00:00');
    const end = new Date(extendedLeave.endDate + 'T00:00:00');
    let workingDays = 0;
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) workingDays++;
      d.setDate(d.getDate() + 1);
    }
    if (workingDays > 5) return true;
  }
  return false;
}
