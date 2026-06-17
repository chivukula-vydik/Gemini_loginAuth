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

  return (
    <div className="ts-page">
      <header className="ts-header">
        <h1 className="ts-h1">Marketplace</h1>
        <p className="ts-sub">Unassigned tasks in your projects that match your skills. Claim one to request it.</p>
      </header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Task</th><th>Project</th><th>Skills</th><th>Estimate</th><th></th></tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={5} className="ts-empty">No matching tasks available right now.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{t.project}</td>
                <td>{t.requiredSkills.length ? t.requiredSkills.join(', ') : '—'}</td>
                <td>{t.estimatedHours}h</td>
                <td>
                  {t.myClaimStatus === 'pending'
                    ? <span className="ts-sub">Claim pending</span>
                    : <button className="link-btn" onClick={() => claim(t._id)}>Claim</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
