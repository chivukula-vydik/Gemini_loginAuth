import { useEffect, useState } from 'react';
import { listSubmittedTimesheets, decideTimesheet, SubmittedTimesheet } from '../pm/pmApi';
import { personName } from '../pm/personName';

export function TimesheetReview() {
  const [sheets, setSheets] = useState<SubmittedTimesheet[]>([]);
  const [error, setError] = useState('');

  function reload() {
    listSubmittedTimesheets().then(setSheets).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function decide(id: string, decision: 'approve' | 'return') {
    setError('');
    try { await decideTimesheet(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div>
      <p className="ts-sub" style={{ marginBottom: 16 }}>{sheets.length} timesheet{sheets.length === 1 ? '' : 's'} awaiting review</p>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Employee</th>
              <th className="col-left">Week</th>
              <th>Total hours</th>
              <th className="col-left">Submitted</th>
              <th className="col-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sheets.length === 0 && (
              <tr><td colSpan={5} className="ts-empty">No submitted timesheets to review.</td></tr>
            )}
            {sheets.map((s) => (
              <tr key={s._id}>
                <td className="ts-task">{personName(s.user)}</td>
                <td className="col-left">{s.weekStart}</td>
                <td>{(s.totalMinutes / 60).toFixed(1)}h</td>
                <td className="col-left">{s.submittedAt ? s.submittedAt.slice(0, 10) : '—'}</td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action approve" onClick={() => decide(s._id, 'approve')}>Approve</button>
                    <button className="table-action danger" onClick={() => decide(s._id, 'return')}>Return</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
