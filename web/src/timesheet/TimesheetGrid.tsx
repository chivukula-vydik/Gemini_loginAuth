import { TaskRow } from './TaskRow';
import { DAYS, formatMinutes, columnDates } from './time';
import type { Task, Entries } from './timesheetApi';

type Props = {
  weekStart: string;
  tasks: Task[];
  onRename: (taskId: string, name: string) => void;
  onCellChange: (taskId: string, day: keyof Entries, minutes: number) => void;
  onDelete: (taskId: string) => void;
  onAddTask: () => void;
};

export function TimesheetGrid({
  weekStart, tasks, onRename, onCellChange, onDelete, onAddTask,
}: Props) {
  const cols = columnDates(weekStart);
  const dayTotal = (day: keyof Entries) =>
    tasks.reduce((sum, t) => sum + (t.entries[day] || 0), 0);

  return (
    <table className="ts-table">
      <thead>
        <tr>
          <th className="ts-task">Task</th>
          {DAYS.map((d) => <th key={d}>{cols[d]}</th>)}
          <th className="ts-rowtotal">Total</th>
          <th aria-hidden="true"></th>
        </tr>
      </thead>
      <tbody>
        {tasks.length === 0 && (
          <tr><td colSpan={8} className="ts-empty">No tasks yet — add one to start tracking.</td></tr>
        )}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onRename={(name) => onRename(t.id, name)}
            onCellChange={(day, m) => onCellChange(t.id, day, m)}
            onDelete={() => onDelete(t.id)}
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
      <caption className="ts-add-caption">
        <button className="btn btn-provider ts-add" type="button" onClick={onAddTask}>+ Add task</button>
      </caption>
    </table>
  );
}
