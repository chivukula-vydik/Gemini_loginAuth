import { useEffect, useState } from 'react';
import { listEditRequests, decideEditRequest, EditReq } from './pmApi';

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };

export function Requests() {
  const [reqs, setReqs] = useState<EditReq[]>([]);
  const [error, setError] = useState('');

  function reload() { listEditRequests().then(setReqs).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function decide(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideEditRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Edit Requests</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th>Week</th><th>Day</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={5} className="ts-empty">No pending requests.</td></tr>}
            {reqs.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{r.userId?.displayName || r.userId?.email || '—'}</td>
                <td>{r.weekStart}</td>
                <td>{DAY_LABEL[r.day] || r.day}</td>
                <td>{r.reason || '—'}</td>
                <td>
                  <div className="ts-nav-left">
                    <button className="link-btn" onClick={() => decide(r._id, 'approved')}>Approve</button>
                    <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(r._id, 'denied')}>Deny</button>
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
