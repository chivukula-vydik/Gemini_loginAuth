import { useCallback, useEffect, useRef, useState } from 'react';
import { WeekNav, SaveStatus } from './WeekNav';
import { TimesheetGrid } from './TimesheetGrid';
import { getWeek, saveWeek, Task, Entries } from './timesheetApi';
import { DAYS, mondayOf, prevWeek, nextWeek } from './time';

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

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const load = useCallback(async (week: string) => {
    setLoadError('');
    try {
      const loaded = await getWeek(week);
      setTasks(loaded);
    } catch (e) {
      setLoadError((e as Error).message);
      setTasks([]);
    }
  }, []);

  // Load whenever the week changes; cancel any pending save first.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirty.current = false;
    setStatus('idle');
    load(weekStart);
  }, [weekStart, load]);

  // Debounced autosave after edits.
  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus('saving');
    const week = weekStart;
    const snapshot = tasks;
    saveTimer.current = setTimeout(async () => {
      try {
        await saveWeek(week, snapshot);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [tasks, weekStart]);

  // All mutations go through here so they mark dirty + trigger autosave.
  function update(next: Task[]) {
    dirty.current = true;
    setTasks(next);
  }

  const onRename = (id: string, name: string) =>
    update(tasks.map((t) => (t.id === id ? { ...t, name } : t)));

  const onCellChange = (id: string, day: keyof Entries, minutes: number) =>
    update(tasks.map((t) => (t.id === id ? { ...t, entries: { ...t.entries, [day]: minutes } } : t)));

  const onDelete = (id: string) => update(tasks.filter((t) => t.id !== id));

  const onAddTask = () => update([...tasks, newTask()]);

  async function onCopyLastWeek() {
    try {
      const prev = await getWeek(prevWeek(weekStart));
      if (prev.length === 0) { setLoadError('Nothing to copy from last week.'); return; }
      update(prev.map((t) => newTask(t.name)));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  const grandTotal = tasks.reduce(
    (sum, t) => sum + DAYS.reduce((s, d) => s + (t.entries[d] || 0), 0),
    0
  );

  return (
    <div className="ts-page">
      <WeekNav
        weekStart={weekStart}
        grandTotal={grandTotal}
        status={status}
        onPrev={() => setWeekStart((w) => prevWeek(w))}
        onNext={() => setWeekStart((w) => nextWeek(w))}
        onCopyLastWeek={onCopyLastWeek}
      />
      {loadError && <p className="ts-error">{loadError} <button className="link-btn" onClick={() => load(weekStart)}>Retry</button></p>}
      <TimesheetGrid
        weekStart={weekStart}
        tasks={tasks}
        onRename={onRename}
        onCellChange={onCellChange}
        onDelete={onDelete}
        onAddTask={onAddTask}
      />
    </div>
  );
}
