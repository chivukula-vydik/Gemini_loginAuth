// Re-estimation history kept permanently against a user. Every ask is recorded
// when submitted and stamped with its outcome when a PM decides — nothing is
// discarded. These are pure transforms over a plain history array; the route
// layer assigns the result back onto the user document.

// Builds one pending history entry from an assignee's estimate request.
export function buildEntry({
  taskId, taskTitle = '', projectId = null, projectName = '',
  fromHours = 0, value = 0, unit = 'hours', toHours = 0, reason = '', at = new Date(),
}) {
  return {
    taskId: taskId != null ? String(taskId) : null,
    taskTitle,
    projectId: projectId != null ? String(projectId) : null,
    projectName,
    fromHours,
    value,
    unit,
    toHours,
    reason,
    status: 'pending',
    requestedAt: at,
    decidedAt: null,
  };
}

// Adds a new ask, or replaces a still-pending ask on the same task (an assignee
// holds at most one pending request per task, so re-asking updates in place
// rather than piling up duplicates). Decided entries are never touched.
export function upsertPending(history, entry) {
  const list = history || [];
  const idx = list.findIndex(
    (h) => h.status === 'pending' && String(h.taskId) === String(entry.taskId),
  );
  if (idx === -1) return [...list, entry];
  const next = list.slice();
  next[idx] = entry;
  return next;
}

// Stamps the pending entry for a task with the PM's decision. If there is no
// pending entry for that task the history is returned unchanged.
export function stampOutcome(history, taskId, decision, at = new Date()) {
  const list = history || [];
  const idx = list.findIndex(
    (h) => h.status === 'pending' && String(h.taskId) === String(taskId),
  );
  if (idx === -1) return list;
  const next = list.slice();
  next[idx] = { ...next[idx], status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: at };
  return next;
}

// Rolls a history up to counts for the past-record column and profile views.
export function summarize(history) {
  const list = history || [];
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  for (const h of list) {
    if (h.status === 'approved') approved += 1;
    else if (h.status === 'rejected') rejected += 1;
    else pending += 1;
  }
  return { total: list.length, approved, rejected, pending };
}
