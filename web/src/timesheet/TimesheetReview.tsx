import { useEffect, useState } from 'react';
import { listSubmittedTimesheets, decideTimesheet, getTimesheetNotes, SubmittedTimesheet, TimesheetNote } from '../pm/pmApi';
import { personName } from '../pm/personName';
import { formatMinutes, DAY_LABELS } from './time';
import type { Day } from './time';

export function TimesheetReview() {
  const [sheets, setSheets] = useState<SubmittedTimesheet[]>([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, TimesheetNote[]>>({});
  const [loadingNotes, setLoadingNotes] = useState<string | null>(null);

  function reload() {
    listSubmittedTimesheets().then(setSheets).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function toggleNotes(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (notes[id]) return;
    setLoadingNotes(id);
    try {
      const data = await getTimesheetNotes(id);
      setNotes((prev) => ({ ...prev, [id]: data }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingNotes(null);
    }
  }

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
            {sheets.map((s) => {
              const isOpen = expanded === s._id;
              const rowNotes = notes[s._id];
              const isLoading = loadingNotes === s._id;
              return (
                <tr key={s._id} style={{ verticalAlign: 'top' }}>
                  <td className="ts-task">
                    <button className="link-btn ts-expand-btn" type="button" onClick={() => toggleNotes(s._id)}>
                      <span className={`ts-expand-arrow${isOpen ? ' open' : ''}`}>&#9654;</span>
                      {personName(s.user)}
                    </button>
                  </td>
                  <td className="col-left">{s.weekStart}</td>
                  <td>{(s.totalMinutes / 60).toFixed(1)}h</td>
                  <td className="col-left">{s.submittedAt ? s.submittedAt.slice(0, 10) : '—'}</td>
                  <td className="col-left">
                    <div className="row-actions">
                      <button className="table-action approve" onClick={() => decide(s._id, 'approve')}>Approve</button>
                      <button className="table-action danger" onClick={() => decide(s._id, 'return')}>Return</button>
                    </div>
                    {isOpen && (
                      <div className="ts-review-notes">
                        {isLoading && <p className="ts-sub">Loading notes…</p>}
                        {rowNotes && rowNotes.length === 0 && <p className="ts-sub">No notes for this timesheet.</p>}
                        {rowNotes && rowNotes.length > 0 && (
                          <ul className="ts-note-list">
                            {rowNotes.map((n, i) => (
                              <li key={i} className="ts-note-item">
                                <span className="ts-note-meta">{n.taskName} · {DAY_LABELS[n.day as Day]} · {formatMinutes(n.minutes)}</span>
                                <span className="ts-note-text">{n.note}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
