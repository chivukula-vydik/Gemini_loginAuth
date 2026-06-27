// web/src/payroll/PayrollRunList.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './PayrollRunList.css';

interface PayrollRun {
  _id: string;
  period: { month: number; year: number };
  payGroup: { _id: string; name: string } | null;
  status: string;
  runType: string;
  totals: { gross: number; deductions: number; netPay: number; headcount: number };
}

interface PayGroup {
  _id: string;
  name: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function PayrollRunList() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [groups, setGroups] = useState<PayGroup[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([authed('/payroll/runs'), authed('/payroll/groups')]).then(([r, g]) => {
      setRuns(r);
      setGroups(g);
      if (g.length && !groupId) setGroupId(g[0]._id);
      setLoading(false);
    });
  }, []);

  async function createRun() {
    const run = await authed('/payroll/runs', 'POST', { month, year, payGroup: groupId });
    setRuns(prev => [run, ...prev]);
    setShowModal(false);
    navigate(`/payroll/run/${run._id}`);
  }

  if (loading) return <div className="pr-page"><div className="pr-empty">Loading...</div></div>;

  return (
    <div className="pr-page">
      <div className="pr-header">
        <h1 className="pr-title">Payroll Runs</h1>
        <button className="pr-btn" onClick={() => setShowModal(true)}>+ New Run</button>
      </div>

      {runs.length === 0 ? (
        <div className="pr-empty">No payroll runs yet. Create one to get started.</div>
      ) : (
        <table className="pr-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Pay Group</th>
              <th>Type</th>
              <th>Status</th>
              <th>Headcount</th>
              <th>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(run => (
              <tr key={run._id}>
                <td><span className="pr-link" onClick={() => navigate(`/payroll/run/${run._id}`)}>{MONTHS[run.period.month - 1]} {run.period.year}</span></td>
                <td>{run.payGroup?.name || '—'}</td>
                <td>{run.runType}</td>
                <td><span className={`pr-status ${run.status}`}>{run.status}</span></td>
                <td>{run.totals?.headcount || 0}</td>
                <td>{formatCurrency(run.totals?.netPay || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <h3>New Payroll Run</h3>
            <div className="pr-form-group">
              <label className="pr-form-label">Month</label>
              <select className="pr-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="pr-form-group">
              <label className="pr-form-label">Year</label>
              <input className="pr-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
            </div>
            <div className="pr-form-group">
              <label className="pr-form-label">Pay Group</label>
              <select className="pr-select" value={groupId} onChange={e => setGroupId(e.target.value)}>
                {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
              </select>
            </div>
            <div className="pr-modal-actions">
              <button className="pr-btn" onClick={createRun}>Create</button>
              <button className="pr-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
