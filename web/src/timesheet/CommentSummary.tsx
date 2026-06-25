import { DAYS, DAY_LABELS } from './time';
import type { Task } from './timesheetApi';

type Props = {
  tasks: Task[];
};

type NoteEntry = { taskName: string; day: string; note: string };
type ProjectGroup = { projectName: string; entries: NoteEntry[] };

export function CommentSummary({ tasks }: Props) {
  const byProject = new Map<string, NoteEntry[]>();

  for (const t of tasks) {
    for (const d of DAYS) {
      const note = t.notes?.[d];
      if (!note) continue;
      const key = t.projectName || 'Other';
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push({ taskName: t.name || 'Untitled', day: DAY_LABELS[d], note });
    }
  }

  const groups: ProjectGroup[] = [];
  for (const [projectName, entries] of byProject) {
    groups.push({ projectName, entries });
  }

  if (groups.length === 0) return null;

  return (
    <div className="cs-panel">
      <h3 className="cs-title">Notes</h3>
      {groups.map((g) => (
        <div key={g.projectName} className="cs-group">
          <div className="cs-project">{g.projectName}</div>
          {g.entries.map((e, i) => (
            <div key={i} className="cs-entry">
              <span className="cs-entry-meta">{e.taskName} &middot; {e.day}</span>
              <span className="cs-entry-note">{e.note}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
