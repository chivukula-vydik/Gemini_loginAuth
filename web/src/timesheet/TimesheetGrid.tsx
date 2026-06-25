import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TaskRow } from './TaskRow';
import { weekBarSegment } from './bar';
import { DAYS, formatMinutes, columnDates, dayDates, todayISO, mondayOf } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant, DayStatusMap, ProjectRef, Assignable, Attachment } from './timesheetApi';
import { uploadAttachment, deleteAttachment, attachmentUrl } from './timesheetApi';
import { popoverPosition, type Placement } from '../pm/popoverPosition';
import { attendanceIcon, attendanceIconColorClass, attendanceTooltip } from './attendanceRow';
import type { AttendanceCell } from './attendanceRow';
import { TaskSearch } from './TaskSearch';

const ADD_MENU_WIDTH = 300;
const ADD_MENU_HEIGHT = 340;

type Props = {
  weekStart: string;
  tasks: Task[];
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
  onBillableChange: (taskId: string, day: Day, value: boolean | null) => void;
  canOverrideBillable?: boolean;
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TimesheetGrid({
  weekStart, tasks, readOnly = false, todayDay, grants, pendingKeys, attendance = {}, dayStatus,
  checkedDays, onToggleDay, onRequestEdit,
  onRename, onCellChange, onNoteChange, onDelete, onAddAssigned, onAddBlank, onProgress,
  projects, onBillableChange, canOverrideBillable = false,
  attachments = [], onAttachmentsChange,
}: Props) {
  const cols = columnDates(weekStart);
  const dates = dayDates(weekStart);
  const today = todayISO();
  const weekIsPast = weekStart < mondayOf();

  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onAttachmentsChange) return;
    setUploading(true);
    try {
      const att = await uploadAttachment(weekStart, file);
      onAttachmentsChange([...attachments, att]);
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeleteAtt(fileId: string) {
    if (!window.confirm('Delete this attachment?') || !onAttachmentsChange) return;
    try {
      await deleteAttachment(weekStart, fileId);
      onAttachmentsChange(attachments.filter((a) => a.fileId !== fileId));
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

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
              onBillableChange={(day, value) => onBillableChange(t.id, day, value)}
              canOverrideBillable={canOverrideBillable}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="ts-task">Daily total</td>
            {DAYS.map((d) => {
              const total = dayTotal(d);
              const ot = total > 600 ? total - 600 : 0;
              return (
                <td key={d} className={`ts-coltotal${todayDay === d ? ' ts-coltoday' : ''}${ot > 0 ? ' ts-ot-day' : ''}`}>
                  {formatMinutes(total)}
                  {ot > 0 && <span className="ts-ot-tag" title={`${formatMinutes(ot)} overtime (pending approval)`}>+{formatMinutes(ot)} OT</span>}
                </td>
              );
            })}
            <td className="ts-rowtotal">{formatMinutes(DAYS.reduce((sum, d) => sum + dayTotal(d), 0))}</td><td></td>
          </tr>
        </tfoot>
      </table>
      <div className="ts-card-foot">
        {!readOnly && (
          <div className="ts-foot-row">
            <div className="ts-add-wrap">
              <button
                ref={triggerRef}
                className="ts-add"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((o) => !o)}
              >
                + Add a task
              </button>
              {pickerOpen && place && createPortal(
                <>
                  <div className="ts-add-backdrop" onClick={() => setPickerOpen(false)} />
                  <div
                    className="ts-add-menu tsk-search-menu"
                    style={{ left: place.left, top: place.top ?? undefined, bottom: place.bottom ?? undefined }}
                  >
                    <TaskSearch
                      projects={projects || []}
                      existingTaskIds={new Set(tasks.filter((t) => t.taskId).map((t) => String(t.taskId)))}
                      onSelect={(a) => { onAddAssigned(a); setPickerOpen(false); }}
                      onAddBlank={() => { onAddBlank(); setPickerOpen(false); }}
                      onClose={() => setPickerOpen(false)}
                    />
                  </div>
                </>,
                document.body,
              )}
            </div>
            {onAttachmentsChange && (
              <div className="ts-attach-wrap">
                <button className="ts-attach-btn" type="button" disabled={uploading || attachments.length >= 5} onClick={() => fileRef.current?.click()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  {uploading ? 'Uploading…' : 'Attach file'}
                </button>
                <input ref={fileRef} type="file" hidden onChange={handleUpload} />
              </div>
            )}
          </div>
        )}
        {attachments.length > 0 && (
          <ul className="ts-att-list">
            {attachments.map((a) => (
              <li key={a.fileId} className="ts-att-item">
                <a href={attachmentUrl(a.fileId)} target="_blank" rel="noopener noreferrer" className="ts-att-link">{a.filename}</a>
                <span className="ts-att-size">{formatSize(a.size)}</span>
                {!readOnly && <button className="ts-att-del" type="button" onClick={() => handleDeleteAtt(a.fileId)}>&times;</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
