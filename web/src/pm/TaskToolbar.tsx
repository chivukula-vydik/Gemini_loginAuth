import type { DueUrgency } from '../timesheet/due';

type Option = { value: string; label: string };

type Props = {
  query: string;
  statuses: string[];
  assignees: string[];
  urgencies: DueUrgency[];
  assigneeOptions: Option[];
  onQueryChange: (v: string) => void;
  onStatusesChange: (v: string[]) => void;
  onAssigneesChange: (v: string[]) => void;
  onUrgenciesChange: (v: DueUrgency[]) => void;
};

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <details className="pm-ms">
      <summary>{label}{selected.length ? ` (${selected.length})` : ''}</summary>
      <div className="pm-ms-menu">
        {options.map((opt) => (
          <label key={opt.value} className="pm-ms-item">
            <input
              type="checkbox"
              checked={selectedSet.has(opt.value)}
              onChange={() => {
                const next = new Set(selectedSet);
                if (next.has(opt.value)) next.delete(opt.value); else next.add(opt.value);
                onChange([...next]);
              }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

const STATUS_OPTIONS: Option[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

const DUE_OPTIONS: Option[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'soon', label: 'Soon' },
  { value: 'ok', label: 'OK' },
];

export function TaskToolbar(props: Props) {
  return (
    <div className="pm-toolbar">
      <input
        className="input pm-toolbar-search"
        placeholder="Search tasks or assignees"
        value={props.query}
        onChange={(e) => props.onQueryChange(e.target.value)}
      />
      <div className="pm-toolbar-filters">
        <MultiSelect
          label="Status"
          options={STATUS_OPTIONS}
          selected={props.statuses}
          onChange={props.onStatusesChange}
        />
        <MultiSelect
          label="Assignee"
          options={props.assigneeOptions}
          selected={props.assignees}
          onChange={props.onAssigneesChange}
        />
        <MultiSelect
          label="Due"
          options={DUE_OPTIONS}
          selected={props.urgencies}
          onChange={(v) => props.onUrgenciesChange(v as DueUrgency[])}
        />
      </div>
    </div>
  );
}
