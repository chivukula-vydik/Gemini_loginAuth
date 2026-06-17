import { endDateFrom } from './estimate.js';

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
        startDate: task.startDate || null,
        endDate: endDateFrom(task.startDate || null, task.estimatedHours || 0),
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
        startDate: info.startDate || null,
        endDate: endDateFrom(info.startDate || null, info.estimatedHours || 0),
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

export function todayDayFor(weekStart, today) {
  for (let i = 0; i < DAYS.length; i += 1) {
    if (addDaysISO(weekStart, i) === today) return DAYS[i];
  }
  return null;
}

export function computeRowLock({
  submittedRows = [], savedRows = [], taskProjectById = new Map(), todayDay = null, grants = [],
}) {
  const grantSet = new Set(grants.map((g) => `${g.day}:${g.projectId}`));
  const savedById = new Map((savedRows || []).map((r) => [String(r.id), r]));
  const projectOf = (row) => {
    if (!row || !row.taskId) return null;
    const p = taskProjectById.get(String(row.taskId));
    return p ? String(p) : null;
  };
  const editableFor = (projectId, day) =>
    day === todayDay || (!!projectId && grantSet.has(`${day}:${projectId}`));

  const rows = (submittedRows || []).map((r) => {
    const prev = savedById.get(String(r.id));
    const projectId = projectOf(r);
    const entries = {};
    for (const d of DAYS) {
      entries[d] = editableFor(projectId, d)
        ? cleanMinutes(r?.entries?.[d])
        : cleanMinutes(prev?.entries?.[d]);
    }
    return { ...r, entries };
  });

  const consumed = (grants || []).filter((g) => (submittedRows || []).some((r) => {
    if (projectOf(r) !== String(g.projectId)) return false;
    const prev = savedById.get(String(r.id));
    return cleanMinutes(r?.entries?.[g.day]) !== cleanMinutes(prev?.entries?.[g.day]);
  }));

  return { rows, consumed };
}
