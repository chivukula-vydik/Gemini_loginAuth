import { useEffect, useState } from 'react';
import {
  listEditRequests, decideEditRequest, EditReq,
  listClaimRequests, decideClaimRequest, ClaimReq,
} from './pmApi';

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };

export function Requests() {
  const [reqs, setReqs] = useState<EditReq[]>([]);
  const [claims, setClaims] = useState<ClaimReq[]>([]);
  const [error, setError] = useState('');

  function reload() {
    listEditRequests().then(setReqs).catch((e) => setError(e.message));
    listClaimRequests().then(setClaims).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function decideEdit(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideEditRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function decideClaim(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideClaimRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Requests</h1></header>
      {error && <p className="ts-error">{error}</p>}

      <h2 className="ts-sub" style={{ fontWeight: 700, fontSize: 15, margin: '8px 0' }}>Timesheet edit requests</h2>
      <div className="ts-card" style={{ marginBottom: 22 }}>
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th>Week</th><th>Day</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={5} className="ts-empty">No pending edit requests.</td></tr>}
            {reqs.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{r.userId?.displayName || r.userId?.email || '—'}</td>
                <td>{r.weekStart}</td>
                <td>{DAY_LABEL[r.day] || r.day}</td>
                <td>{r.reason || '—'}</td>
                <td>
                  <div className="ts-nav-left">
                    <button className="link-btn" onClick={() => decideEdit(r._id, 'approved')}>Approve</button>
                    <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decideEdit(r._id, 'denied')}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="ts-sub" style={{ fontWeight: 700, fontSize: 15, margin: '8px 0' }}>Task claims</h2>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th>Task</th><th>Project</th><th></th></tr></thead>
          <tbody>
            {claims.length === 0 && <tr><td colSpan={4} className="ts-empty">No pending claims.</td></tr>}
            {claims.map((c) => (
              <tr key={c._id}>
                <td className="ts-task">{c.user?.displayName || c.user?.email || '—'}</td>
                <td>{c.task?.title}</td>
                <td>{c.project?.name}</td>
                <td>
                  <div className="ts-nav-left">
                    <button className="link-btn" onClick={() => decideClaim(c._id, 'approved')}>Approve</button>
                    <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decideClaim(c._id, 'denied')}>Deny</button>
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
