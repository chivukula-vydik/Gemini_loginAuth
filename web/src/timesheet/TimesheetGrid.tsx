import { useEffect, useRef, useState } from 'react';
import { TaskRow } from './TaskRow';
import { weekBarSegment } from './bar';
import { addableTasks } from './addRow';
import { DAYS, formatMinutes, columnDates, dayDates, todayISO, mondayOf } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant, Assignable } from './timesheetApi';

type Props = {
  weekStart: string;
  tasks: Task[];
  assignable: Assignable[];
  readOnly?: boolean;
  todayDay: Day | null;
  grants: Grant[];
  pendingKeys: Set<string>;
  onRequestEdit: (day: Day, projectId: string) => void;
  onRename: (taskId: string, name: string) => void;
  onCellChange: (taskId: string, day: keyof Entries, minutes: number) => void;
  onDelete: (taskId: string) => void;
  onAddAssigned: (a: Assignable) => void;
  onAddBlank: () => void;
  onProgress: (taskId: string, patch: { percentComplete?: number; status?: string }) => void;
};

export function TimesheetGrid({
  weekStart, tasks, assignable, readOnly = false, todayDay, grants, pendingKeys, onRequestEdit,
  onRename, onCellChange, onDelete, onAddAssigned, onAddBlank, onProgress,
}: Props) {
  const cols = columnDates(weekStart);
  const dates = dayDates(weekStart);
  const today = todayISO();
  const weekIsPast = weekStart < mondayOf();

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const addable = addableTasks(assignable, tasks);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    function onDocClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  const dayTotal = (day: keyof Entries) =>
    tasks.reduce((sum, t) => sum + (t.entries[day] || 0), 0);

  return (
    <div className="ts-card">
      <table className="ts-table">
        <thead>
          <tr>
            <th className="ts-task">Task</th>
            {DAYS.map((d) => {
              const isFuture = dates[d] > today;
              const isToday = todayDay === d;
              return <th key={d} className={`${isFuture ? 'ts-day-future' : ''}${isToday ? ' ts-day-today' : ''}`.trim() || undefined}>{cols[d]}</th>;
            })}
            <th className="ts-rowtotal">Total</th>
            <th className="ts-actions" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr>
              <td colSpan={8} className="ts-empty">
                {readOnly ? 'No tasks were logged this week.' : 'No tasks yet — add one to start tracking.'}
              </td>
            </tr>
          )}
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              readOnly={readOnly}
              todayDay={todayDay}
              grants={grants}
              dates={dates}
              today={today}
              weekIsPast={weekIsPast}
              pendingKeys={pendingKeys}
              bar={weekBarSegment(weekStart, t.startDate, t.endDate)}
              onRename={(name) => onRename(t.id, name)}
              onCellChange={(day, m) => onCellChange(t.id, day, m)}
              onDelete={() => onDelete(t.id)}
              onRequestEdit={onRequestEdit}
              onProgress={(patch) => onProgress(t.id, patch)}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="ts-task">Daily total</td>
            {DAYS.map((d) => <td key={d} className={`ts-coltotal${todayDay === d ? ' ts-coltoday' : ''}`}>{formatMinutes(dayTotal(d))}</td>)}
            <td></td><td></td>
          </tr>
        </tfoot>
      </table>
      {!readOnly && (
        <div className="ts-card-foot">
          <div className="ts-add-wrap" ref={pickerRef}>
            <button
              className="ts-add"
              type="button"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
            >
              + Add a task
            </button>
            {pickerOpen && (
              <div className="ts-add-menu" role="menu">
                {addable.length > 0 && (
                  <div className="ts-add-group">
                    <div className="ts-add-group-label">My assigned tasks</div>
                    {addable.map((a) => (
                      <button
                        key={a.taskId}
                        className="ts-add-item"
                        type="button"
                        role="menuitem"
                        onClick={() => { onAddAssigned(a); setPickerOpen(false); }}
                      >
                        <span className="ts-add-item-title">{a.title}</span>
                        {a.projectName && <span className="ts-add-item-meta">{a.projectName}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {addable.length === 0 && (
                  <div className="ts-add-empty">No assigned tasks left to add.</div>
                )}
                <div className="ts-add-group">
                  <button
                    className="ts-add-item"
                    type="button"
                    role="menuitem"
                    onClick={() => { onAddBlank(); setPickerOpen(false); }}
                  >
                    <span className="ts-add-item-title">No task assigned</span>
                    <span className="ts-add-item-meta">Meetings, admin, training…</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
