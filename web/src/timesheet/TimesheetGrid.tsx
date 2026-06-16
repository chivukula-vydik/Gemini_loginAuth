import { TaskRow } from './TaskRow';
import { DAYS, formatMinutes, columnDates } from './time';
import type { Day } from './time';
import type { Task, Entries } from './timesheetApi';

type Props = {
  weekStart: string;
  tasks: Task[];
  readOnly?: boolean;
  editableDays: string[];
  onRequestEdit: (day: string) => void;
  onRename: (taskId: string, name: string) => void;
  onCellChange: (taskId: string, day: keyof Entries, minutes: number) => void;
  onDelete: (taskId: string) => void;
  onAddTask: () => void;
  onProgress: (taskId: string, patch: { percentComplete?: number; status?: string }) => void;
};

export function TimesheetGrid({
  weekStart, tasks, readOnly = false, editableDays, onRequestEdit,
  onRename, onCellChange, onDelete, onAddTask, onProgress,
}: Props) {
  const cols = columnDates(weekStart);
  const editable = new Set(editableDays);
  const lockedDays = {} as Record<Day, boolean>;
  DAYS.forEach((d) => { lockedDays[d] = !editable.has(d); });

  const dayTotal = (day: keyof Entries) =>
    tasks.reduce((sum, t) => sum + (t.entries[day] || 0), 0);

  return (
    <div className="ts-card">
      <table className="ts-table">
        <thead>
          <tr>
            <th className="ts-task">Task</th>
            {DAYS.map((d) => (
              <th key={d} className={editable.has(d) ? undefined : 'ts-day-future'}>
                {cols[d]}
                {!editable.has(d) && (
                  <button className="link-btn ts-req" type="button" onClick={() => onRequestEdit(d)}>request</button>
                )}
              </th>
            ))}
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
              lockedDays={lockedDays}
              onRename={(name) => onRename(t.id, name)}
              onCellChange={(day, m) => onCellChange(t.id, day, m)}
              onDelete={() => onDelete(t.id)}
              onProgress={(patch) => onProgress(t.id, patch)}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="ts-task">Daily total</td>
            {DAYS.map((d) => <td key={d} className="ts-coltotal">{formatMinutes(dayTotal(d))}</td>)}
            <td></td><td></td>
          </tr>
        </tfoot>
      </table>
      {!readOnly && (
        <div className="ts-card-foot">
          <button className="ts-add" type="button" onClick={onAddTask}>+ Add task</button>
        </div>
      )}
    </div>
  );
}
