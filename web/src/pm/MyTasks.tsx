import { useEffect, useState } from 'react';
import { myTasks, proposeEstimate, proposeExtension, EstimateUnit, Task, listMyOffers, decideOffer, AssignmentOffer } from './pmApi';
import { dueUrgency, dueLabel } from '../timesheet/due';
import { todayISO } from '../timesheet/time';

const UNITS: EstimateUnit[] = ['hours', 'days', 'weeks'];

function DueLabel({ task }: { task: Task }) {
  const today = todayISO();
  const due = task.dueDate ? task.dueDate.slice(0, 10) : (task.effectiveDueDate ?? null);
  if (!due) return <span className="ts-cell-ro-empty">—</span>;
  const urgency = dueUrgency(due, today, task.status);
  return (
    <span className={`due-chip ${urgency ?? 'ok'}`} title={task.dueDateAuto ? 'Auto (start + estimate)' : 'Set by PM'}>
      <span className="due-dot" />
      {due}
      {(urgency === 'overdue' || urgency === 'soon') && <span className="due-rel">{dueLabel(due, today)}</span>}
    </span>
  );
}

function ExtensionRequest({ task, onRequest }: { task: Task; onRequest: (value: number, unit: EstimateUnit) => void }) {
  const [value, setValue] = useState(2);
  const [unit, setUnit] = useState<EstimateUnit>('days');
  const [open, setOpen] = useState(false);

  if (task.dueProposalStatus === 'proposed') {
    return (
      <span className="ext-note ext-pending" title="Waiting for your PM to approve">
        ⏳ Extension requested{task.dueProposalDate ? ` → ${task.dueProposalDate}` : ''} (pending)
      </span>
    );
  }

  const today = todayISO();
  const due = task.dueDate ? task.dueDate.slice(0, 10) : (task.effectiveDueDate ?? null);
  const overdue = dueUrgency(due, today, task.status) === 'overdue';
  if (!overdue || task.status === 'done') return null;

  if (!open) {
    return (
      <button className="link-btn ext-trigger" onClick={() => setOpen(true)}>
        {task.dueProposalStatus === 'rejected' ? 'Request more time again' : 'Request more time'}
      </button>
    );
  }

  return (
    <span className="ts-nav-left ext-form">
      <span className="ext-prefix">finish in</span>
      <input className="ts-pct" type="number" min={1} value={value}
        onChange={(e) => setValue(Number(e.target.value))} />
      <select className="input ts-status" value={unit} onChange={(e) => setUnit(e.target.value as EstimateUnit)}>
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <button className="link-btn" onClick={() => { onRequest(value, unit); setOpen(false); }}>send</button>
      <button className="link-btn" style={{ color: 'var(--muted)' }} onClick={() => setOpen(false)}>cancel</button>
    </span>
  );
}

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
  const [offers, setOffers] = useState<AssignmentOffer[]>([]);
  const [error, setError] = useState('');

  function reload() {
    myTasks().then(setTasks).catch((e) => setError(e.message));
    listMyOffers().then(setOffers).catch(() => {});
  }

  async function decide(id: string, decision: 'accept' | 'decline') {
    setError('');
    try { await decideOffer(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { reload(); }, []);

  async function propose(id: string, value: number, unit: EstimateUnit) {
    setError('');
    try { await proposeEstimate(id, value, unit); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function requestExtension(id: string, value: number, unit: EstimateUnit) {
    setError('');
    try { await proposeExtension(id, value, unit); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">My Tasks</h1></header>
      {error && <p className="ts-error">{error}</p>}
      {offers.length > 0 && (
        <div className="ts-card" style={{ marginBottom: 16 }}>
          <h2 className="ts-sub" style={{ fontWeight: 700, fontSize: 15, margin: '4px 0 10px' }}>Task offers</h2>
          <table className="ts-table">
            <thead><tr><th className="ts-task">Task</th><th>Project</th><th></th></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o._id}>
                  <td className="ts-task">{o.task.title}</td>
                  <td>{o.project.name}</td>
                  <td>
                    <div className="ts-nav-left">
                      <button className="link-btn" onClick={() => decide(o._id, 'accept')}>Accept</button>
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(o._id, 'decline')}>Decline</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
                <td>
                  <div className="due-stack">
                    <DueLabel task={t} />
                    <ExtensionRequest task={t} onRequest={(v, u) => requestExtension(t._id, v, u)} />
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
