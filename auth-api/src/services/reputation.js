// Company-fit (reputation) rollups: persistent, person-level signals derived
// from a user's re-estimation history and their task outcomes. Pure transforms
// over plain arrays — the route assembles inputs and serializes the result.

const MS_PER_DAY = 86400000;

// Did re-estimations push the original estimate up (under-scoped) or down
// (over-scoped)?
export function directionCounts(history) {
  let under = 0, over = 0, same = 0;
  for (const h of history || []) {
    if (h.toHours > h.fromHours) under += 1;
    else if (h.toHours < h.fromHours) over += 1;
    else same += 1;
  }
  return { under, over, same };
}

// Share of a person's assignments that reached "done".
export function completionStats(tasks) {
  const list = tasks || [];
  const assigned = list.length;
  const done = list.filter((t) => t.status === 'done').length;
  return { done, assigned, rate: assigned ? done / assigned : 0 };
}

// On-time delivery, measured only over done tasks that have both a due date and
// a completion timestamp. avgDelayDays averages the lateness (0 for on-time)
// across measured tasks. Null when nothing is measurable yet.
export function onTimeStats(tasks) {
  const measured = (tasks || []).filter((t) => t.status === 'done' && t.completedAt && t.dueDate);
  let onTime = 0;
  let delaySum = 0;
  for (const t of measured) {
    const delayDays = (new Date(t.completedAt) - new Date(t.dueDate)) / MS_PER_DAY;
    if (delayDays <= 0) onTime += 1;
    else delaySum += delayDays;
  }
  const n = measured.length;
  return {
    measured: n,
    onTime,
    rate: n ? onTime / n : null,
    avgDelayDays: n ? Number((delaySum / n).toFixed(1)) : null,
  };
}
