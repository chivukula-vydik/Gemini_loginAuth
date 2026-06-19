import { TaskRow } from './TaskRow';
import { weekBarSegment } from './bar';
import { DAYS, formatMinutes, columnDates, dayDates, todayISO, mondayOf } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant } from './timesheetApi';

type Props = {
  weekStart: string;
  tasks: Task[];
  readOnly?: boolean;
  todayDay: Day | null;
  grants: Grant[];
  pendingKeys: Set<string>;
  onRequestEdit: (day: Day, projectId: string) => void;
  onRename: (taskId: string, name: string) => void;
  onCellChange: (taskId: string, day: keyof Entries, minutes: number) => void;
  onDelete: (taskId: string) => void;
  onAddTask: () => void;
  onProgress: (taskId: string, patch: { percentComplete?: number; status?: string }) => void;
};

export function TimesheetGrid({
  weekStart, tasks, readOnly = false, todayDay, grants, pendingKeys, onRequestEdit,
  onRename, onCellChange, onDelete, onAddTask, onProgress,
}: Props) {
  const cols = columnDates(weekStart);
  const dates = dayDates(weekStart);
  const today = todayISO();
  const weekIsPast = weekStart < mondayOf();

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
          <button className="ts-add" type="button" onClick={onAddTask}>+ Add task</button>
        </div>
      )}
    </div>
  );
}
