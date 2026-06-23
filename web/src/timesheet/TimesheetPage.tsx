import { useCallback, useEffect, useRef, useState } from 'react';
import { WeekNav, SaveStatus } from './WeekNav';
import { TimesheetGrid } from './TimesheetGrid';
import { SummaryTiles } from './SummaryTiles';
import { getWeek, saveWeek, submitWeek, createEditRequest, Task, Entries, Grant, Assignable } from './timesheetApi';
import { blankRow, rowFromAssignable } from './addRow';
import { canSubmit, SubmitStatus } from './submit';
import type { Day } from './time';
import { setTaskProgress } from '../pm/pmApi';
import { DAYS, DAY_LABELS, mondayOf, prevWeek, nextWeek, dayDates, todayISO } from './time';
import { LeaveModal } from '../attendance/LeaveModal';
import { getRange, getState, AttendanceDoc } from '../attendance/attendanceApi';
import { resolveAttendanceRow, AttendanceCell } from './attendanceRow';

function newTask(name = ''): Task {
  const entries = {} as Entries;
  DAYS.forEach((d) => { entries[d] = 0; });
  const notes = {} as Record<Day, string>;
  DAYS.forEach((d) => { notes[d] = ''; });
  return { id: crypto.randomUUID(), name, entries, notes };
}

export function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignable, setAssignable] = useState<Assignable[]>([]);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState('');
  const [todayDay, setTodayDay] = useState<Day | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('draft');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [attendanceDocs, setAttendanceDocs] = useState<AttendanceDoc[]>([]);
  const [activatedDate, setActivatedDate] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;

  const load = useCallback(async (week: string) => {
    setLoadError('');
    try {
      const loaded = await getWeek(week);
      if (weekStartRef.current !== week) return;
      setTasks(loaded.tasks);
      setAssignable(loaded.assignable);
      setTodayDay(loaded.todayDay);
      setGrants(loaded.grants);
      setPendingKeys(loaded.pending.map((g) => `${g.day}:${g.projectId}`));
      setReadOnly(loaded.readOnly);
      setSubmitStatus(loaded.status);
      setSubmittedAt(loaded.submittedAt);
      setReviewedAt(loaded.reviewedAt);
      setRejectionReason(loaded.rejectionReason);
    } catch (e) {
      if (weekStartRef.current !== week) return;
      setLoadError((e as Error).message);
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirty.current = false;
    setStatus('idle');
    setPendingKeys([]);
    load(weekStart);
  }, [weekStart, load]);

  useEffect(() => {
    getState().then((s) => setActivatedDate(s.activatedDate)).catch(() => {});
  }, []);

  const dd = dayDates(weekStart);

  useEffect(() => {
    getRange(dd.mon, dd.fri).then(setAttendanceDocs).catch(() => setAttendanceDocs([]));
  }, [dd.mon, dd.fri]);

  const attendance = resolveAttendanceRow(dd, attendanceDocs, activatedDate, todayISO());

  // Listen for PM task deletions and remove matching timesheet rows (by taskId)
  useEffect(() => {
    function handleDeleted(e: Event) {
      const detail = (e as CustomEvent)?.detail;
      const deleted: string[] = Array.isArray(detail?.taskIds) ? detail.taskIds : [];
      if (deleted.length === 0) return;
      setTasks((prev) => {
        const next = prev.filter((t) => !(t.taskId && deleted.includes(t.taskId)));
        if (next.length !== prev.length) dirty.current = true;
        return next;
      });
    }
    window.addEventListener('pm:tasks-deleted', handleDeleted as EventListener);
    return () => window.removeEventListener('pm:tasks-deleted', handleDeleted as EventListener);
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus('saving');
    const week = weekStart;
    const snapshot = tasks;
    saveTimer.current = setTimeout(async () => {
      try {
        await saveWeek(week, snapshot);
        dirty.current = false;
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [tasks, weekStart]);

  function update(next: Task[]) {
    if (readOnly) return;
    dirty.current = true;
    setTasks(next);
  }

  const onRename = (id: string, name: string) =>
    update(tasks.map((t) => (t.id === id ? { ...t, name } : t)));

  const onCellChange = (id: string, day: keyof Entries, minutes: number) =>
    update(tasks.map((t) => (t.id === id ? { ...t, entries: { ...t.entries, [day]: minutes } } : t)));

  const onNoteChange = (id: string, day: Day, text: string) =>
    update(tasks.map((t) => (t.id === id ? { ...t, notes: { ...t.notes, [day]: text } } : t)));

  const onDelete = (id: string) => update(tasks.filter((t) => t.id !== id));

  const onAddAssigned = (a: Assignable) => update([...tasks, rowFromAssignable(a)]);
  const onAddBlank = () => update([...tasks, blankRow('No task assigned')]);

  function onProgress(id: string, patch: { percentComplete?: number; status?: string }) {
    const row = tasks.find((t) => t.id === id);
    if (!row?.taskId) return;
    setTaskProgress(row.taskId, patch).catch(() => {});
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function goToWeek(target: string) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (dirty.current) {
      saveWeek(weekStart, tasks).catch(() => {});
      dirty.current = false;
    }
    setWeekStart(target);
  }

  async function onCopyLastWeek() {
    if (readOnly) return;
    try {
      const prev = await getWeek(prevWeek(weekStart));
      if (prev.tasks.length === 0) { setLoadError('Nothing to copy from last week.'); return; }
      update(prev.tasks.map((t) => newTask(t.name)));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  const submittable = canSubmit(submitStatus, weekStart, mondayOf());

  async function onSubmit() {
    if (!submittable) return;
    if (!window.confirm('Submit this week for review? You won’t be able to edit it after.')) return;
    try {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (dirty.current) { await saveWeek(weekStart, tasks); dirty.current = false; }
      await submitWeek(weekStart);
      await load(weekStart);
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  async function onRequestEdit(day: Day, projectId: string) {
    const reason = window.prompt('Reason for editing this past day?') ?? '';
    try {
      await createEditRequest(weekStart, day, projectId, reason);
      const key = `${day}:${projectId}`;
      setPendingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  const dayTotals = DAYS.map((d) => ({
    day: d,
    total: tasks.reduce((s, t) => s + (t.entries[d] || 0), 0),
  }));
  const weekTotal = dayTotals.reduce((s, x) => s + x.total, 0);
  const busiest = dayTotals.reduce((a, b) => (b.total > a.total ? b : a), dayTotals[0]);

  return (
    <div className="ts-page">
      <header className="ts-header ts-header-row">
        <div>
          <h1 className="ts-h1">Timesheet</h1>
          <p className="ts-sub">Log hours per task across the week. Totals update as you type.</p>
        </div>
        <button className="att-act att-act-sm ts-leave-btn" onClick={() => setLeaveOpen(true)}>Apply for leave</button>
      </header>

      <WeekNav
        weekStart={weekStart}
        status={status}
        readOnly={readOnly}
        submitStatus={submitStatus}
        submittedAt={submittedAt}
        submittable={submittable}
        onPrev={() => goToWeek(prevWeek(weekStart))}
        onNext={() => goToWeek(nextWeek(weekStart))}
        onToday={() => goToWeek(mondayOf())}
        onCopyLastWeek={onCopyLastWeek}
        onSubmit={onSubmit}
      />

      {readOnly && (
        <div className="ts-readonly-banner">
          {submitStatus === 'submitted'
            ? <>Submitted{submittedAt ? ` on ${submittedAt.slice(0, 10)}` : ''} — awaiting PM review.</>
            : submitStatus === 'approved'
              ? <>Approved{reviewedAt ? ` on ${reviewedAt.slice(0, 10)}` : ''}.</>
              : <>Viewing a past week — read only. Use <strong>Today</strong> to return to the current week and make changes.</>}
        </div>
      )}
      {submitStatus === 'returned' && (
        <div className="ts-returned-banner">
          Your PM sent this back{rejectionReason ? `: ${rejectionReason}` : ''} — review and resubmit.
        </div>
      )}

      <SummaryTiles
        weekTotal={weekTotal}
        busiestLabel={DAY_LABELS[busiest.day]}
        busiestMinutes={busiest.total}
        activeTasks={tasks.length}
      />

      {loadError && <p className="ts-error">{loadError} <button className="link-btn" onClick={() => load(weekStart)}>Retry</button></p>}

      <TimesheetGrid
        weekStart={weekStart}
        tasks={tasks}
        assignable={assignable}
        readOnly={readOnly}
        todayDay={todayDay}
        grants={grants}
        pendingKeys={new Set(pendingKeys)}
        attendance={attendance}
        onRequestEdit={onRequestEdit}
        onRename={onRename}
        onCellChange={onCellChange}
        onNoteChange={onNoteChange}
        onDelete={onDelete}
        onAddAssigned={onAddAssigned}
        onAddBlank={onAddBlank}
        onProgress={onProgress}
      />

      {leaveOpen && (
        <LeaveModal
          today={todayISO()}
          onClose={() => setLeaveOpen(false)}
          onSubmitted={() => setLeaveOpen(false)}
        />
      )}
    </div>
  );
}
