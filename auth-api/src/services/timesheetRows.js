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

function notesOf(row) {
  const n = (row && row.notes) || {};
  const out = {};
  for (const d of DAYS) {
    const raw = n[d];
    out[d] = typeof raw === 'string' ? raw.trim().slice(0, 500) : '';
  }
  return out;
}

function savedNotes(row) {
  const n = (row && row.notes) || {};
  const out = {};
  for (const d of DAYS) out[d] = typeof n[d] === 'string' ? n[d] : '';
  return out;
}

export function currentMonday() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

// The week is built only from rows the employee deliberately added (fork A,
// "clean week"). Assigned tasks never auto-appear; a saved row linked to a task
// is hydrated from taskInfoById so its name/metadata stay in sync with the task.
export function mergeWeekRows({ savedRows = [], taskInfoById = new Map() }) {
  const out = [];
  const used = new Set();

  for (const r of savedRows) {
    if (r.taskId) {
      const tid = String(r.taskId);
      if (used.has(tid)) continue;
      const info = taskInfoById.get(tid) || {};
      out.push({
        id: r.id || tid,
        taskId: tid,
        name: info.title || r.name || '',
        description: info.description || '',
        locked: true,
        percentComplete: info.percentComplete || 0,
        estimatedHours: info.estimatedHours || 0,
        actualMinutes: info.actualMinutes || 0,
        status: info.status || 'todo',
        startDate: info.startDate || null,
        endDate: endDateFrom(info.startDate || null, info.estimatedHours || 0),
        projectId: info.projectId || null,
        entries: entriesOf(r),
        notes: savedNotes(r),
      });
      used.add(tid);
    } else {
      out.push({ id: r.id, taskId: null, name: r.name || '', locked: false, projectId: null, entries: entriesOf(r), notes: savedNotes(r) });
    }
  }
  return out;
}

// Tasks the employee may add to the week via the "Add a task" picker: their
// assigned, non-done tasks minus any already present as a saved row this week.
export function assignableTasks(assignedTasks = [], savedRows = []) {
  const inWeek = new Set(
    savedRows.filter((r) => r.taskId).map((r) => String(r.taskId)),
  );
  return assignedTasks
    .filter((t) => t.status !== 'done' && !inWeek.has(String(t._id)))
    .map((t) => ({
      taskId: String(t._id),
      title: t.title,
      description: t.description || '',
      projectName: t.projectName,
      status: t.status,
      estimatedHours: t.estimatedHours,
    }));
}

export function sanitizeRows(rows, allowedTaskIds) {
  if (!Array.isArray(rows)) return [];
  const allowed = new Set((allowedTaskIds || []).map(String));
  return rows.map((t) => {
    const entries = {};
    for (const day of DAYS) entries[day] = cleanMinutes(t?.entries?.[day]);
    const taskId = t?.taskId && allowed.has(String(t.taskId)) ? String(t.taskId) : null;
    const notes = notesOf(t);
    return { id: String(t?.id ?? ''), name: String(t?.name ?? ''), entries, taskId, notes };
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
  submittedRows = [], savedRows = [], taskProjectById = new Map(),
  taskStartById = new Map(), weekStart = null, todayDay = null, grants = [],
}) {
  const grantSet = new Set(grants.map((g) => `${g.day}:${String(g.projectId)}`));
  const savedById = new Map((savedRows || []).map((r) => [String(r.id), r]));
  const projectOf = (row) => {
    if (!row || !row.taskId) return null;
    const p = taskProjectById.get(String(row.taskId));
    return p ? String(p) : null;
  };
  const startOf = (row) => {
    if (!row || !row.taskId) return null;
    return taskStartById.get(String(row.taskId)) || null;
  };
  const dayDate = (day) => (weekStart ? addDaysISO(weekStart, DAYS.indexOf(day)) : null);
  // A task is only editable on/after the day it was assigned (its start date).
  // Current week (todayDay set): today and any earlier weekday are freely
  // editable; future days are always locked and grants do not apply. In previous
  // weeks (todayDay null) a matching approved grant unlocks the day.
  const editableFor = (projectId, day, startDate) => {
    if (startDate) {
      const cd = dayDate(day);
      if (cd && cd < startDate) return false;
    }
    if (todayDay) return DAYS.indexOf(day) <= DAYS.indexOf(todayDay);
    return !!projectId && grantSet.has(`${day}:${projectId}`);
  };

  const rows = (submittedRows || []).map((r) => {
    const prev = savedById.get(String(r.id));
    const projectId = projectOf(r);
    const startDate = startOf(r);
    const entries = {};
    const notes = {};
    for (const d of DAYS) {
      const editable = editableFor(projectId, d, startDate);
      entries[d] = editable
        ? cleanMinutes(r?.entries?.[d])
        : cleanMinutes(prev?.entries?.[d]);
      const subNote = typeof r?.notes?.[d] === 'string' ? r.notes[d] : '';
      const prevNote = typeof prev?.notes?.[d] === 'string' ? prev.notes[d] : '';
      notes[d] = editable ? subNote : prevNote;
    }
    return { ...r, entries, notes };
  });

  const consumed = (grants || []).filter((g) => (submittedRows || []).some((r) => {
    if (projectOf(r) !== String(g.projectId)) return false;
    const prev = savedById.get(String(r.id));
    return cleanMinutes(r?.entries?.[g.day]) !== cleanMinutes(prev?.entries?.[g.day]);
  }));

  return { rows, consumed };
}

// --- submission lifecycle helpers ---
// status ∈ 'draft' | 'submitted' | 'approved' | 'returned'

export function canSubmit(status, weekStart, currentMondayISO) {
  return (status === 'draft' || status === 'returned') && weekStart <= currentMondayISO;
}

export function weekLocked(status) {
  return status === 'submitted' || status === 'approved';
}
