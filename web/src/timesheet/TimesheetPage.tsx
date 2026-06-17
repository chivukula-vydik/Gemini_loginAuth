import { useCallback, useEffect, useRef, useState } from 'react';
import { WeekNav, SaveStatus } from './WeekNav';
import { TimesheetGrid } from './TimesheetGrid';
import { SummaryTiles } from './SummaryTiles';
import { getWeek, saveWeek, createEditRequest, Task, Entries, Grant } from './timesheetApi';
import type { Day } from './time';
import { setTaskProgress } from '../pm/pmApi';
import { DAYS, DAY_LABELS, mondayOf, prevWeek, nextWeek } from './time';

function newTask(name = ''): Task {
  const entries = {} as Entries;
  DAYS.forEach((d) => { entries[d] = 0; });
  return { id: crypto.randomUUID(), name, entries };
}

export function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState('');
  const [todayDay, setTodayDay] = useState<Day | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);

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
      setTodayDay(loaded.todayDay);
      setGrants(loaded.grants);
      setPendingKeys(loaded.pending.map((g) => `${g.day}:${g.projectId}`));
      setReadOnly(loaded.readOnly);
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

  const onDelete = (id: string) => update(tasks.filter((t) => t.id !== id));

  const onAddTask = () => update([...tasks, newTask()]);

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
      <header className="ts-header">
        <h1 className="ts-h1">Timesheet</h1>
        <p className="ts-sub">Log hours per task across the week. Totals update as you type.</p>
      </header>

      <WeekNav
        weekStart={weekStart}
        status={status}
        readOnly={readOnly}
        onPrev={() => goToWeek(prevWeek(weekStart))}
        onNext={() => goToWeek(nextWeek(weekStart))}
        onToday={() => goToWeek(mondayOf())}
        onCopyLastWeek={onCopyLastWeek}
      />

      {readOnly && (
        <div className="ts-readonly-banner">
          Viewing a past week — read only. Use <strong>Today</strong> to return to the current week and make changes.
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
        readOnly={readOnly}
        todayDay={todayDay}
        grants={grants}
        pendingKeys={new Set(pendingKeys)}
        onRequestEdit={onRequestEdit}
        onRename={onRename}
        onCellChange={onCellChange}
        onDelete={onDelete}
        onAddTask={onAddTask}
        onProgress={onProgress}
      />
    </div>
  );
}
