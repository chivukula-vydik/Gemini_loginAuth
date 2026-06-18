// Color-coded status pill (dot + label). Maps known task/project statuses to a
// semantic tone; unknown values fall back to a neutral pill with a title-cased label.
const TONES: Record<string, { tone: string; label: string }> = {
  todo: { tone: 'todo', label: 'To do' },
  in_progress: { tone: 'in-progress', label: 'In progress' },
  'in progress': { tone: 'in-progress', label: 'In progress' },
  active: { tone: 'in-progress', label: 'Active' },
  planning: { tone: 'planning', label: 'Planning' },
  blocked: { tone: 'blocked', label: 'Blocked' },
  done: { tone: 'done', label: 'Done' },
  completed: { tone: 'done', label: 'Completed' },
  archived: { tone: 'archived', label: 'Archived' },
  rejected: { tone: 'blocked', label: 'Rejected' },
};

function titleCase(s: string) {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status }: { status: string }) {
  const key = (status ?? '').toLowerCase();
  const def = TONES[key] ?? { tone: 'neutral', label: titleCase(status || 'Unknown') };
  return (
    <span className={`status-badge status-${def.tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {def.label}
    </span>
  );
}
