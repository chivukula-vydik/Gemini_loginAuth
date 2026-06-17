import { TimeCell } from './TimeCell';
import { DAYS, formatMinutes } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant } from './timesheetApi';
import type { BarSegment } from './bar';
import { isCellEditable } from './cellLock';

type Props = {
  task: Task;
  readOnly?: boolean;
  todayDay: Day | null;
  grants: Grant[];
  dates: Record<Day, string>;
  today: string;
  pendingKeys: Set<string>;
  bar?: BarSegment | null;
  onRename: (name: string) => void;
  onCellChange: (day: keyof Entries, minutes: number) => void;
  onDelete: () => void;
  onRequestEdit: (day: Day, projectId: string) => void;
  onProgress: (patch: { percentComplete?: number; status?: string }) => void;
};

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

export function TaskRow({ task, readOnly = false, todayDay, grants, dates, today, pendingKeys, bar = null, onRename, onCellChange, onDelete, onRequestEdit, onProgress }: Props) {
  const rowTotal = DAYS.reduce((sum, d) => sum + (task.entries[d] || 0), 0);
  const isPm = !!task.taskId;
  return (
    <tr>
      <td className="ts-task">
        {isPm ? (
          <div>
            <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
            <span className="ts-pm-badge">PM</span>
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
        const editable = isCellEditable(d, task.projectId, todayDay, grants);
        const isPast = dates[d] < today;
        const canRequest = !editable && isPast && !!task.taskId && !!task.projectId;
        const pending = canRequest && pendingKeys.has(`${d}:${task.projectId}`);
        return (
          <td key={d} className="ts-cell">
            {inBar && (
              <div
                className={`ts-bar ts-bar-${task.status ?? 'todo'}${capL ? ' ts-bar-l' : ''}${capR ? ' ts-bar-r' : ''}`}
                title={`${task.startDate ?? ''} → ${task.endDate ?? ''}`}
              />
            )}
            <TimeCell
              minutes={task.entries[d] || 0}
              readOnly={readOnly || !editable}
              onChange={(m) => onCellChange(d, m)}
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
        {isPm ? (
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
        ) : (
          !readOnly && <button className="ts-del" type="button" aria-label="Delete task" onClick={onDelete}>×</button>
        )}
      </td>
    </tr>
  );
}
