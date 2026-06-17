import { Task } from '../models/Task.js';

export async function hasActiveTask(userId) {
  const existing = await Task.exists({ assignee: userId, status: { $ne: 'done' } });
  return !!existing;
}
