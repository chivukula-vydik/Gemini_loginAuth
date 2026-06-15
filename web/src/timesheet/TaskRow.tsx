import { TimeCell } from './TimeCell';
import { DAYS, formatMinutes } from './time';
import type { Task, Entries } from './timesheetApi';

type Props = {
  task: Task;
  onRename: (name: string) => void;
  onCellChange: (day: keyof Entries, minutes: number) => void;
  onDelete: () => void;
};

export function TaskRow({ task, onRename, onCellChange, onDelete }: Props) {
  const rowTotal = DAYS.reduce((sum, d) => sum + (task.entries[d] || 0), 0);
  return (
    <tr>
      <td className="ts-task">
        <input
          className="ts-name"
          placeholder="Task name"
          value={task.name}
          onChange={(e) => onRename(e.target.value)}
        />
      </td>
      {DAYS.map((d) => (
        <td key={d}>
          <TimeCell minutes={task.entries[d] || 0} onChange={(m) => onCellChange(d, m)} />
        </td>
      ))}
      <td className="ts-rowtotal">{formatMinutes(rowTotal)}</td>
      <td>
        <button className="ts-del" type="button" aria-label="Delete task" onClick={onDelete}>×</button>
      </td>
    </tr>
  );
}
