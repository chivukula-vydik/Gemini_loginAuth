import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TaskRow } from './TaskRow';
import { weekBarSegment } from './bar';
import { addableTasks } from './addRow';
import { DAYS, formatMinutes, columnDates, dayDates, todayISO, mondayOf } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant, Assignable, DayStatusMap, ProjectRef } from './timesheetApi';
import { createTimesheetTask } from './timesheetApi';
import { popoverPosition, type Placement } from '../pm/popoverPosition';
import { attendanceIcon, attendanceIconColorClass, attendanceTooltip } from './attendanceRow';
import type { AttendanceCell } from './attendanceRow';

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
  attendance?: Partial<Record<Day, AttendanceCell>>;
  dayStatus?: DayStatusMap;
  checkedDays?: Set<Day>;
  onToggleDay?: (day: Day) => void;
  onRequestEdit: (day: Day, projectId: string) => void;
  onRename: (taskId: string, name: string) => void;
  onCellChange: (taskId: string, day: keyof Entries, minutes: number) => void;
  onNoteChange: (taskId: string, day: Day, text: string) => void;
  onDelete: (taskId: string) => void;
  onAddAssigned: (a: Assignable) => void;
  onAddBlank: () => void;
  onProgress: (taskId: string, patch: { percentComplete?: number; status?: string }) => void;
  projects?: ProjectRef[];
  onTaskCreated?: (a: Assignable) => void;
};

export function TimesheetGrid({
  weekStart, tasks, assignable, readOnly = false, todayDay, grants, pendingKeys, attendance = {}, dayStatus,
  checkedDays, onToggleDay, onRequestEdit,
  onRename, onCellChange, onNoteChange, onDelete, onAddAssigned, onAddBlank, onProgress,
  projects, onTaskCreated,
}: Props) {
  const cols = columnDates(weekStart);
  const dates = dayDates(weekStart);
  const today = todayISO();
  const weekIsPast = weekStart < mondayOf();

  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const addable = addableTasks(assignable, tasks);
  const [createMode, setCreateMode] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [creating, setCreating] = useState(false);

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

  // Reset the inline create form whenever the menu closes so reopening it
  // starts fresh rather than showing a half-filled form from last time.
  useEffect(() => {
    if (pickerOpen) return;
    setCreateMode(false);
    setNewTitle('');
    setNewProjectId('');
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
              const cls = `${isFuture ? 'ts-day-future' : ''}${isToday ? ' ts-day-today' : ''}`.trim() || undefined;
              const cell = attendance[d];
              const ds = dayStatus?.[d];
              const dayS = ds?.status || 'draft';
              const showCheck = !readOnly && (dayS === 'draft' || dayS === 'returned') && !isFuture;
              return (
                <th key={d} className={cls}>
                  <div className="ts-day-header">
                    {showCheck && onToggleDay && (
                      <input
                        type="checkbox"
                        className="ts-day-check"
                        checked={checkedDays?.has(d) || false}
                        onChange={() => onToggleDay(d)}
                      />
                    )}
                    {cols[d]}
                    {dayS !== 'draft' && <span className={`ts-day-dot ts-day-dot-${dayS}`} title={dayS} />}
                  </div>
                  {cell && (
                    <span
                      className={`ts-th-icon ${attendanceIconColorClass(cell.status)}`}
                      title={attendanceTooltip(cell.status, cell.effectiveMinutes, cell.needsRegularise, cell.note)}
                    >
                      {attendanceIcon(cell.status)}{cell.needsRegularise ? '⚠' : ''}
                    </span>
                  )}
                </th>
              );
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
              dayStatus={dayStatus}
              onRename={(name) => onRename(t.id, name)}
              onCellChange={(day, m) => onCellChange(t.id, day, m)}
              onNoteChange={(day, text) => onNoteChange(t.id, day, text)}
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
                          title={a.description || undefined}
                          onClick={() => { onAddAssigned(a); setPickerOpen(false); }}
                        >
                          <span className="ts-add-item-title">{a.title}</span>
                          {a.projectName && <span className="ts-add-item-meta">{a.projectName}</span>}
                          {a.description && <span className="ts-add-item-meta">{a.description}</span>}
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
                  <div className="ts-add-group">
                    <div className="ts-add-group-label">Create new task</div>
                    {!createMode ? (
                      <button className="ts-add-item" type="button" role="menuitem" onClick={() => setCreateMode(true)}>
                        <span className="ts-add-item-title">+ New task</span>
                        <span className="ts-add-item-meta">Create a task under a project</span>
                      </button>
                    ) : (
                      <div className="ts-create-form">
                        <select className="input ts-create-select" value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
                          <option value="">Select project…</option>
                          {(projects || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                        </select>
                        <input className="input ts-create-input" placeholder="Task name" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                        <button
                          className="btn btn-primary ts-create-btn"
                          type="button"
                          disabled={!newTitle.trim() || !newProjectId || creating}
                          onClick={async () => {
                            setCreating(true);
                            try {
                              const result = await createTimesheetTask(newTitle.trim(), newProjectId);
                              onTaskCreated?.(result);
                              setPickerOpen(false);
                              setCreateMode(false);
                              setNewTitle('');
                              setNewProjectId('');
                            } catch (e) {
                              window.alert((e as Error).message);
                            } finally {
                              setCreating(false);
                            }
                          }}
                        >
                          {creating ? 'Creating…' : 'Create & add'}
                        </button>
                      </div>
                    )}
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
