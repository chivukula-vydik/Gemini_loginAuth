export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function cleanMinutes(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function entriesOf(row) {
  const e = (row && row.entries) || {};
  const out = {};
  for (const d of DAYS) out[d] = cleanMinutes(e[d]);
  return out;
}

function zeroEntries() {
  return { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
}

export function currentMonday() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

export function mergeWeekRows({ savedRows = [], assignedTasks = [], taskInfoById = new Map(), editable }) {
  const out = [];
  const used = new Set();
  const savedByTaskId = new Map(
    savedRows.filter((r) => r.taskId).map((r) => [String(r.taskId), r]),
  );

  if (editable) {
    for (const task of assignedTasks) {
      const tid = String(task._id);
      const sr = savedByTaskId.get(tid);
      out.push({
        id: sr ? sr.id : tid,
        taskId: tid,
        name: task.title,
        locked: true,
        percentComplete: task.percentComplete || 0,
        estimatedHours: task.estimatedHours || 0,
        actualMinutes: task.actualMinutes || 0,
        status: task.status || 'todo',
        entries: sr ? entriesOf(sr) : zeroEntries(),
      });
      used.add(tid);
    }
  }

  for (const r of savedRows) {
    if (r.taskId) {
      const tid = String(r.taskId);
      if (used.has(tid)) continue;
      const info = taskInfoById.get(tid) || {};
      out.push({
        id: r.id || tid,
        taskId: tid,
        name: info.title || r.name || '',
        locked: true,
        percentComplete: info.percentComplete || 0,
        estimatedHours: info.estimatedHours || 0,
        actualMinutes: info.actualMinutes || 0,
        status: info.status || 'todo',
        entries: entriesOf(r),
      });
      used.add(tid);
    } else {
      out.push({ id: r.id, taskId: null, name: r.name || '', locked: false, entries: entriesOf(r) });
    }
  }
  return out;
}

export function sanitizeRows(rows, allowedTaskIds) {
  if (!Array.isArray(rows)) return [];
  const allowed = new Set((allowedTaskIds || []).map(String));
  return rows.map((t) => {
    const entries = {};
    for (const day of DAYS) entries[day] = cleanMinutes(t?.entries?.[day]);
    const taskId = t?.taskId && allowed.has(String(t.taskId)) ? String(t.taskId) : null;
    return { id: String(t?.id ?? ''), name: String(t?.name ?? ''), entries, taskId };
  });
}

function addDaysISO(weekStart, n) {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export function editableDaysFor(weekStart, today, approvedDays = []) {
  const approved = new Set(approvedDays);
  const out = [];
  DAYS.forEach((day, i) => {
    const date = addDaysISO(weekStart, i);
    if (date === today) out.push(day);
    else if (date < today && approved.has(day)) out.push(day);
  });
  return out;
}

export function applyDayLock(submittedRows, savedRows, editableDays) {
  const editable = new Set(editableDays);
  const savedById = new Map((savedRows || []).map((r) => [String(r.id), r]));
  return (submittedRows || []).map((r) => {
    const prev = savedById.get(String(r.id));
    const entries = {};
    for (const d of DAYS) {
      entries[d] = editable.has(d) ? cleanMinutes(r?.entries?.[d]) : cleanMinutes(prev?.entries?.[d]);
    }
    return { ...r, entries };
  });
}
