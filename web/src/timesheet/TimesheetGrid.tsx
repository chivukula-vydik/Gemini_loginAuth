import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TaskRow } from './TaskRow';
import { weekBarSegment } from './bar';
import { addableTasks } from './addRow';
import { DAYS, formatMinutes, columnDates, dayDates, todayISO, mondayOf } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant, Assignable } from './timesheetApi';
import { popoverPosition, type Placement } from '../pm/popoverPosition';

// Rough size of the add-task menu, used to flip it above the trigger when there
// isn't room below. Real height is capped by max-height in CSS.
const ADD_MENU_WIDTH = 260;
const ADD_MENU_HEIGHT = 320;

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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const addable = addableTasks(assignable, tasks);

  // The menu is portaled to <body> so the card's `overflow: hidden` can't clip
  // it. Anchor it to the trigger, flipping above when there's no room below.
  useLayoutEffect(() => {
    if (!pickerOpen || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPlace(popoverPosition(
      { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      { width: window.innerWidth, height: window.innerHeight },
      ADD_MENU_HEIGHT, ADD_MENU_WIDTH,
    ));
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
          <div className="ts-add-wrap">
            <button
              ref={triggerRef}
              className="ts-add"
              type="button"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
            >
              + Add a task
            </button>
            {pickerOpen && place && createPortal(
              <>
                <div className="ts-add-backdrop" onClick={() => setPickerOpen(false)} />
                <div
                  className="ts-add-menu"
                  role="menu"
                  style={{ left: place.left, top: place.top ?? undefined, bottom: place.bottom ?? undefined }}
                >
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
              </>,
              document.body,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
