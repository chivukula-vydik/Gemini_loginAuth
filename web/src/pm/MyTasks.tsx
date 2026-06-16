import { useEffect, useState } from 'react';
import { myTasks, proposeEstimate, Task } from './pmApi';

export function MyTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { myTasks().then(setTasks).catch((e) => setError(e.message)); }, []);

  async function propose(id: string, hours: number) {
    setError('');
    try { await proposeEstimate(id, hours); myTasks().then(setTasks); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">My Tasks</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Task</th><th>Project</th><th>Estimate</th>
              <th>Actual</th><th>%</th><th>Status</th><th>Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={7} className="ts-empty">No tasks assigned to you yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{typeof t.project === 'object' ? t.project.name : '—'}</td>
                <td>
                  {t.estimateStatus === 'approved'
                    ? `${t.estimatedHours}h`
                    : (
                      <span className="ts-nav-left">
                        <input className="ts-pct" type="number" min={0} defaultValue={t.proposedHours ?? 0}
                          onBlur={(e) => propose(t._id, Number(e.target.value))} />
                        <span className="ts-sub">{t.estimateStatus === 'proposed' ? 'proposed' : t.estimateStatus === 'rejected' ? 'rejected' : 'propose hrs'}</span>
                      </span>
                    )}
                </td>
                <td>{((t.actualMinutes ?? 0) / 60).toFixed(1)}h</td>
                <td>{t.percentComplete ?? 0}%</td>
                <td>{t.status}</td>
                <td>{t.dueDate ? t.dueDate.slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
