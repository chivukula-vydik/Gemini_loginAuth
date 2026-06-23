import { useEffect, useState } from 'react';
import { authHeaders } from './timesheetApi';
import { formatMinutes, DAY_LABELS } from './time';
import type { Day } from './time';

const API = 'http://localhost:4000';

type NoteRow = { taskName: string; day: Day; minutes: number; note: string };

export function CommentSummary({ timesheetId }: { timesheetId: string }) {
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/timesheets/review/${timesheetId}/notes`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [timesheetId]);

  if (loading) return <p className="ts-sub">Loading notes…</p>;
  if (rows.length === 0) return <p className="ts-sub">No notes this week.</p>;

  return (
    <table className="cs-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Day</th>
          <th>Hours</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.taskName}</td>
            <td>{DAY_LABELS[r.day]}</td>
            <td>{formatMinutes(r.minutes)}</td>
            <td className="cs-note">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
