export const UNIT_HOURS = { hours: 1, days: 8, weeks: 40 };

export function toHours(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return 0;
  const factor = UNIT_HOURS[unit];
  return factor ? v * factor : 0;
}

export function estimateWorkingDays(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.ceil(h / 8);
}

function isWeekend(d) {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

export function taskHours(task) {
  if (task.estimateValue && task.estimateUnit) return toHours(task.estimateValue, task.estimateUnit);
  return Number(task.estimatedHours) || 0;
}

function toISODate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Due date = manual dueDate if set, else Start Date + estimated duration.
export function effectiveDueDate(task) {
  const manual = toISODate(task.dueDate);
  if (manual) return { date: manual, auto: false };
  const startISO = toISODate(task.startDate);
  return { date: endDateFrom(startISO, taskHours(task)), auto: true };
}

// New completion date a behind-schedule assignee is promising: anchor + duration.
export function proposedDueDate(task) {
  if (task.dueProposalStatus !== 'proposed') return null;
  const anchorISO = toISODate(task.dueProposalAt) || toISODate(new Date());
  return endDateFrom(anchorISO, toHours(task.dueProposalValue, task.dueProposalUnit));
}

export function endDateFrom(startISO, hours) {
  if (!startISO) return null;
  const days = estimateWorkingDays(hours);
  const d = new Date(`${startISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (days <= 0) return startISO;
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  let counted = 1;
  while (counted < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) counted += 1;
  }
  return d.toISOString().slice(0, 10);
}
