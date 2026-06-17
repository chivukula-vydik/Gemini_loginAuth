import { Task } from '../models/Task.js';

// Retained helper (its prior callers — auto-offer-on-busy — are removed this cycle).
export async function hasActiveTask(userId) {
  const existing = await Task.exists({ 'assignees.user': userId, status: { $ne: 'done' } });
  return !!existing;
}
