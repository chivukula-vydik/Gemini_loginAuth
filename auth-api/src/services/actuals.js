import mongoose from 'mongoose';
import { Timesheet } from '../models/Timesheet.js';

export async function actualMinutesByTask(taskIds) {
  const map = new Map();
  const ids = (taskIds || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  if (ids.length === 0) return map;
  const rows = await Timesheet.aggregate([
    { $unwind: '$tasks' },
    { $match: { 'tasks.taskId': { $in: ids } } },
    {
      $group: {
        _id: '$tasks.taskId',
        minutes: {
          $sum: {
            $add: [
              '$tasks.entries.mon', '$tasks.entries.tue', '$tasks.entries.wed',
              '$tasks.entries.thu', '$tasks.entries.fri',
            ],
          },
        },
      },
    },
  ]);
  for (const r of rows) map.set(String(r._id), r.minutes || 0);
  return map;
}
