import { useEffect, useState } from 'react';
import { listMarketplace, claimTask, MarketTask } from './pmApi';

export function Marketplace() {
  const [tasks, setTasks] = useState<MarketTask[]>([]);
  const [error, setError] = useState('');

  function reload() { listMarketplace().then(setTasks).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function claim(id: string) {
    setError('');
    try { await claimTask(id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  const pending = tasks.filter((t) => t.myClaimStatus === 'pending').length;
  const totalHours = tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Marketplace</h1>
          <p className="ts-sub">Unassigned tasks that match your skills — from any project, even ones you're not on. Claim one to request it.</p>
        </div>
      </header>

      <div className="ts-tiles">
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Available</span>
          <span className="ts-tile-value">{tasks.length}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">Claims pending</span>
          <span className="ts-tile-value">{pending}</span>
        </div>
        <div className="ts-tile stat-logged">
          <span className="ts-tile-label">Total estimated</span>
          <span className="ts-tile-value">{totalHours}<span className="stat-sub">h</span></span>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Task</th><th className="col-left">Project</th><th className="col-left">Skills</th><th>Estimate</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {tasks.length === 0 && (
              <tr><td colSpan={5}>
                <div className="empty-state">
                  <span className="empty-state-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
                    </svg>
                  </span>
                  <span className="empty-state-title">Nothing to claim right now</span>
                  <span className="empty-state-text">Tasks matching your skills will show up here when they're available.</span>
                </div>
              </td></tr>
            )}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">
                  {t.title}
                  {t.description && <div className="ts-sub">{t.description}</div>}
                </td>
                <td className="col-left">{t.project}</td>
                <td className="col-left">
                  {t.requiredSkills.length
                    ? <span className="tag-list">{t.requiredSkills.map((s) => <span key={s} className="mini-tag">{s}</span>)}</span>
                    : <span className="ts-sub">—</span>}
                </td>
                <td>{t.estimatedHours}h</td>
                <td className="col-left">
                  {t.myClaimStatus === 'pending'
                    ? <span className="status-badge status-planning"><span className="status-dot" aria-hidden="true" />Pending</span>
                    : <button className="table-action" onClick={() => claim(t._id)}>Claim</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
