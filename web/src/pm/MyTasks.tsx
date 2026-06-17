import { useEffect, useState } from 'react';
import { myTasks, proposeEstimate, EstimateUnit, Task } from './pmApi';

const UNITS: EstimateUnit[] = ['hours', 'days', 'weeks'];

function ProposeEstimate({ task, onPropose }: { task: Task; onPropose: (value: number, unit: EstimateUnit) => void }) {
  const [value, setValue] = useState<number>(task.proposedValue ?? 0);
  const [unit, setUnit] = useState<EstimateUnit>(task.proposedUnit ?? 'hours');
  return (
    <span className="ts-nav-left">
      <input className="ts-pct" type="number" min={0} value={value}
        onChange={(e) => setValue(Number(e.target.value))} />
      <select className="input ts-status" value={unit} onChange={(e) => setUnit(e.target.value as EstimateUnit)}>
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <button className="link-btn" onClick={() => onPropose(value, unit)}>propose</button>
      <span className="ts-sub">{task.estimateStatus === 'proposed' ? 'proposed' : task.estimateStatus === 'rejected' ? 'rejected' : ''}</span>
    </span>
  );
}

export function MyTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  function reload() { myTasks().then(setTasks).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function propose(id: string, value: number, unit: EstimateUnit) {
    setError('');
    try { await proposeEstimate(id, value, unit); reload(); }
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
                    ? `${t.estimateValue || t.estimatedHours} ${t.estimateUnit ?? 'hours'}`
                    : <ProposeEstimate task={t} onPropose={(v, u) => propose(t._id, v, u)} />}
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
