import { TimeCell } from './TimeCell';
import { DAYS, formatMinutes } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant, DayStatusMap } from './timesheetApi';
import type { BarSegment } from './bar';
import { isCellEditable, canRequestEdit } from './cellLock';
import { dueUrgency, dueLabel } from './due';
import { StatusBadge } from '../pm/StatusBadge';

type Props = {
  task: Task;
  readOnly?: boolean;
  todayDay: Day | null;
  grants: Grant[];
  dates: Record<Day, string>;
  today: string;
  weekIsPast: boolean;
  pendingKeys: Set<string>;
  bar?: BarSegment | null;
  dayStatus?: DayStatusMap;
  onRename: (name: string) => void;
  onCellChange: (day: keyof Entries, minutes: number) => void;
  onNoteChange: (day: Day, text: string) => void;
  onDelete: () => void;
  onRequestEdit: (day: Day, projectId: string) => void;
  onProgress: (patch: { percentComplete?: number; status?: string }) => void;
  onBillableChange: (day: Day, value: boolean | null) => void;
  canOverrideBillable?: boolean;
};

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

export function TaskRow({ task, readOnly = false, todayDay, grants, dates, today, weekIsPast, pendingKeys, bar = null, dayStatus, onRename, onCellChange, onNoteChange, onDelete, onRequestEdit, onProgress, onBillableChange, canOverrideBillable = false }: Props) {
  const rowTotal = DAYS.reduce((sum, d) => sum + (task.entries[d] || 0), 0);
  const isPm = !!task.taskId;
  const urgency = isPm ? dueUrgency(task.endDate, today, task.status) : null;
  const showDue = urgency === 'overdue' || urgency === 'soon';
  return (
    <tr className={showDue ? `ts-row-${urgency}` : undefined}>
      <td className="ts-task">
        {isPm ? (
          <div className="ts-task-identity">
            <div className="ts-task-identity-top">
              <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
              <span className="ts-pm-badge">PM</span>
              {task.effectiveBillable && (
                <span className={`ts-billable-tag ${Object.values(task.effectiveBillable).some(Boolean) ? 'billable' : 'non-billable'}`}>
                  {Object.values(task.effectiveBillable).some(Boolean) ? 'Billable' : 'Non-billable'}
                </span>
              )}
              {task.status && <StatusBadge status={task.status} />}
              {showDue && task.endDate && (
                <span className={`due-pill ${urgency}`}>{dueLabel(task.endDate, today)}</span>
              )}
            </div>
            {task.projectName && <div className="ts-task-project">{task.projectName}</div>}
            {task.clientName && <div className="ts-task-client">{task.clientName}</div>}
            {task.description && <div className="ts-sub">{task.description}</div>}
            <div className="ts-pm-meta">
              Planned {task.estimatedHours ?? 0}h · Actual {((task.actualMinutes ?? 0) / 60).toFixed(1)}h
            </div>
          </div>
        ) : readOnly ? (
          <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
        ) : (
          <input
            className="ts-name"
            placeholder="Task name"
            value={task.name}
            onChange={(e) => onRename(e.target.value)}
          />
        )}
      </td>
      {DAYS.map((d, i) => {
        const inBar = bar && i >= bar.startCol && i <= bar.endCol;
        const capL = inBar && i === bar!.startCol && !bar!.continuesLeft;
        const capR = inBar && i === bar!.endCol && !bar!.continuesRight;
        const isToday = todayDay === d;
        const editable = isCellEditable(d, task.projectId, todayDay, grants, dates[d], task.startDate, dayStatus?.[d]);
        const isPast = dates[d] < today;
        const canRequest = canRequestEdit(weekIsPast, editable, isPast, task);
        const pending = canRequest && pendingKeys.has(`${d}:${task.projectId}`);
        return (
          <td key={d} className={`ts-cell${isToday ? ' ts-cell-today' : ''}`}>
            {inBar && (
              <div
                className={`ts-bar ts-bar-${task.status ?? 'todo'}${capL ? ' ts-bar-l' : ''}${capR ? ' ts-bar-r' : ''}`}
                title={`${task.startDate ?? ''} → ${task.endDate ?? ''}`}
              />
            )}
            <TimeCell
              className={isToday ? 'ts-cell-today' : ''}
              minutes={task.entries[d] || 0}
              readOnly={!editable}
              onChange={(m) => onCellChange(d, m)}
              note={task.notes?.[d] || ''}
              onNoteChange={(text) => onNoteChange(d, text)}
            />
            {canRequest && (
              pending
                ? <span className="ts-req ts-pending">pending</span>
                : <button className="link-btn ts-req" type="button" onClick={() => onRequestEdit(d, task.projectId as string)}>request</button>
            )}
          </td>
        );
      })}
      <td className="ts-rowtotal">{formatMinutes(rowTotal)}</td>
      <td className="ts-actions">
        <div className="ts-actions-wrap">
          {isPm && (
            <div className="ts-progress">
              <input
                className="ts-pct"
                type="number"
                min={0}
                max={100}
                value={task.percentComplete ?? 0}
                disabled={readOnly}
                onChange={(e) => onProgress({ percentComplete: Number(e.target.value) })}
              />
              <span>%</span>
              <select
                className="input ts-status"
                value={task.status ?? 'todo'}
                disabled={readOnly}
                onChange={(e) => onProgress({ status: e.target.value })}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {!readOnly && <button className="ts-del" type="button" aria-label="Remove task" onClick={onDelete}>×</button>}
        </div>
      </td>
    </tr>
  );
}
