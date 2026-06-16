import { TimeCell } from './TimeCell';
import { DAYS, formatMinutes } from './time';
import type { Day } from './time';
import type { Task, Entries } from './timesheetApi';

type Props = {
  task: Task;
  readOnly?: boolean;
  lockedDays?: Partial<Record<Day, boolean>>;
  onRename: (name: string) => void;
  onCellChange: (day: keyof Entries, minutes: number) => void;
  onDelete: () => void;
  onProgress: (patch: { percentComplete?: number; status?: string }) => void;
};

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

export function TaskRow({ task, readOnly = false, lockedDays = {}, onRename, onCellChange, onDelete, onProgress }: Props) {
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
      {DAYS.map((d) => (
        <td key={d}>
          <TimeCell
            minutes={task.entries[d] || 0}
            readOnly={readOnly || !!lockedDays[d]}
            onChange={(m) => onCellChange(d, m)}
          />
        </td>
      ))}
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
