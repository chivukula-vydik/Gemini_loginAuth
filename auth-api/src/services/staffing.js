import { assigneeHours } from './workload.js';

// Fixed weekly ceiling: 8h x 5 working days. One source of truth.
export const CAPACITY_HOURS = 40;

// Status thresholds (absolute committed hours against the 40h cap).
const AVAILABLE_BELOW = 20; // < 20h committed -> lots of room
const BUSY_AT = 34;         // >= 34h committed -> effectively full

// Flat sum of a person's committed hours over their active (non-done) task
// assignments. Uses the submitted per-assignee estimate when present, else
// falls back to share math (assigneeHours). Done tasks never count.
export function committedHours(entries) {
  return (entries || []).reduce((sum, e) => {
    if (!e || e.status === 'done') return sum;
    const hours = e.estimatedHours != null
      ? Number(e.estimatedHours) || 0
      : assigneeHours(e.taskEstimatedHours, e.sharePct);
    return sum + hours;
  }, 0);
}

// Derives availability from committed hours — never stored, no state machine.
export function classifyAvailability(hours, capacity = CAPACITY_HOURS) {
  const h = Number(hours) || 0;
  const loadPct = Math.min(100, Math.round((h / capacity) * 100));
  const status = h < AVAILABLE_BELOW ? 'available' : h < BUSY_AT ? 'standby' : 'busy';
  return { status, loadPct, hours: h, capacity };
}
