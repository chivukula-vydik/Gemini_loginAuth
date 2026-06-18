import { useState } from 'react';
import type { Person } from './pmApi';
import { personName } from './personName';

type Props = {
  selectedCount: number;
  members: Person[];
  onCloseTasks: () => void;
  onSetStatus: (status: string) => void;
  onReassign: (assigneeId: string) => void;
  onDelete: () => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
};

export function BulkBar(props: Props) {
  const [status, setStatus] = useState('in_progress');
  const [assignee, setAssignee] = useState('');

  if (props.selectedCount < 1) return null;

  return (
    <div className="pm-bulkbar" role="region" aria-label="Bulk actions">
      <span className="pm-bulk-count">{props.selectedCount} selected</span>
      <button className="btn btn-ghost" onClick={props.onCloseTasks}>Close</button>
      <select className="input pm-bulk-select" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="todo">To do</option>
        <option value="in_progress">In progress</option>
        <option value="blocked">Blocked</option>
        <option value="done">Done</option>
      </select>
      <button className="btn btn-ghost" onClick={() => props.onSetStatus(status)}>Set status</button>
      <select className="input pm-bulk-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
        <option value="">Reassign to…</option>
        {props.members.map((m) => <option key={m._id} value={m._id}>{personName(m)}</option>)}
      </select>
      <button className="btn btn-ghost" onClick={() => assignee && props.onReassign(assignee)} disabled={!assignee}>Reassign</button>
      <button className="btn btn-ghost" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={props.onDelete}>Delete</button>
      <button className="btn btn-ghost" onClick={props.onExportCSV}>Export CSV</button>
      <button className="btn btn-ghost" onClick={props.onExportXLSX}>Export Excel</button>
    </div>
  );
}
