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
