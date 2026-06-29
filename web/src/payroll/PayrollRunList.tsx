import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconCash, IconPlus, IconDotsVertical, IconFileSpreadsheet,
  IconDownload, IconRefresh, IconCalendarEvent, IconUsers,
  IconChevronRight, IconRocket,
} from '@tabler/icons-react';
import { authed } from '../fetchHelper';
import './PayrollRunList.css';

interface PayrollRun {
  _id: string;
  period: { month: number; year: number };
  payGroup: { _id: string; name: string } | null;
  status: string;
  runType: string;
  totals: { gross: number; deductions: number; netPay: number; headcount: number };
  createdAt: string;
}

interface PayGroup {
  _id: string;
  name: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function statusLabel(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function statusClass(s: string) {
  switch (s) {
    case 'PAID': return 'prl-pill-success';
    case 'DRAFT': return 'prl-pill-warning';
    case 'REVIEW': return 'prl-pill-info';
    case 'LOCKED': return 'prl-pill-locked';
    default: return '';
  }
}

export function PayrollRunList() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [groups, setGroups] = useState<PayGroup[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([authed('/payroll/runs'), authed('/payroll/groups')]).then(([r, g]) => {
      setRuns(r);
      setGroups(g);
      if (g.length && !groupId) setGroupId(g[0]._id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function createRun() {
    const run = await authed('/payroll/runs', 'POST', { month, year, payGroup: groupId });
    setRuns(prev => [run, ...prev]);
    setShowModal(false);
    navigate(`/payroll/run/${run._id}`);
  }

  if (loading) return <div className="prl-page"><div className="prl-empty-box">Loading…</div></div>;

  const currentRun = runs.find(r => r.status === 'DRAFT' || r.status === 'REVIEW');
  const historyRuns = runs.filter(r => r !== currentRun);

  const fyRuns = runs.filter(r => r.status === 'PAID');
  const paidThisFY = fyRuns.reduce((sum, r) => sum + (r.totals?.netPay || 0), 0);
  const avgNetPay = fyRuns.length ? paidThisFY / fyRuns.length : 0;

  return (
    <div className="prl-page">
      <div className="prl-header">
        <div>
          <h1 className="prl-title">Payroll Runs</h1>
          <p className="prl-subtitle">Manage monthly payroll processing</p>
        </div>
        <button className="prl-btn-primary" onClick={() => setShowModal(true)}>
          <IconPlus size={16} /> New Run
        </button>
      </div>

      {/* ── Metric strip ─────────────────────────────────────── */}
      {fyRuns.length > 0 && (
        <div className="prl-metrics">
          <div className="prl-metric">
            <span className="prl-metric-label">Paid this FY</span>
            <span className="prl-metric-value">{formatCurrency(paidThisFY)}</span>
          </div>
          <div className="prl-metric-sep" />
          <div className="prl-metric">
            <span className="prl-metric-label">Avg net pay</span>
            <span className="prl-metric-value">{formatCurrency(avgNetPay)}</span>
          </div>
          <div className="prl-metric-sep" />
          <div className="prl-metric">
            <span className="prl-metric-label">Runs completed</span>
            <span className="prl-metric-value">{fyRuns.length}</span>
          </div>
        </div>
      )}

      {/* ── Current run card ─────────────────────────────────── */}
      {currentRun && (
        <div className={`prl-current ${currentRun.status === 'DRAFT' ? 'prl-current-draft' : 'prl-current-review'}`}>
          <div className="prl-current-top">
            <div className="prl-current-left">
              <div className="prl-current-period">
                <IconCalendarEvent size={18} />
                {MONTHS[currentRun.period.month - 1]} {currentRun.period.year}
              </div>
              <span className={`prl-pill ${statusClass(currentRun.status)}`}>
                {statusLabel(currentRun.status)}
              </span>
            </div>
            {currentRun.payGroup && (
              <span className="prl-current-group">{currentRun.payGroup.name}</span>
            )}
          </div>

          <div className="prl-current-body">
            <div className="prl-current-net">
              <span className="prl-current-net-label">Net pay</span>
              <span className="prl-current-net-amount">{formatCurrency(currentRun.totals?.netPay || 0)}</span>
            </div>
            <div className="prl-current-stats">
              <div className="prl-current-stat">
                <IconUsers size={16} />
                <span>{currentRun.totals?.headcount || 0} employees</span>
              </div>
              <div className="prl-current-stat">
                <IconCash size={16} />
                <span>Gross {formatCurrency(currentRun.totals?.gross || 0)}</span>
              </div>
            </div>
          </div>

          <div className="prl-current-actions">
            <button className="prl-btn-primary" onClick={() => navigate(`/payroll/run/${currentRun._id}`)}>
              <IconRocket size={16} />
              {currentRun.status === 'DRAFT' ? 'Review and run' : 'Continue review'}
            </button>
            <button className="prl-btn-secondary" onClick={() => navigate(`/payroll/run/${currentRun._id}`)}>
              Preview
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────── */}
      {runs.length === 0 && (
        <div className="prl-empty-box">
          <IconCash size={40} strokeWidth={1.2} />
          <h3>No payroll runs yet</h3>
          <p>Create your first run to start processing payroll.</p>
          <button className="prl-btn-primary" onClick={() => setShowModal(true)}>
            <IconPlus size={16} /> New Run
          </button>
        </div>
      )}

      {/* ── History table ────────────────────────────────────── */}
      {historyRuns.length > 0 && (
        <div className="prl-history">
          <h2 className="prl-history-title">History</h2>
          <div className="prl-table-wrap">
            <table className="prl-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Pay group</th>
                  <th>Status</th>
                  <th>Headcount</th>
                  <th className="prl-col-right">Net pay</th>
                  <th className="prl-col-action" />
                </tr>
              </thead>
              <tbody>
                {historyRuns.map(run => (
                  <tr key={run._id} className="prl-row" onClick={() => navigate(`/payroll/run/${run._id}`)}>
                    <td>
                      <span className="prl-period-text">
                        {MONTHS[run.period.month - 1]} {run.period.year}
                      </span>
                    </td>
                    <td className="prl-group-text">{run.payGroup?.name || '—'}</td>
                    <td>
                      <span className={`prl-pill ${statusClass(run.status)}`}>
                        {statusLabel(run.status)}
                      </span>
                    </td>
                    <td>{run.totals?.headcount || 0}</td>
                    <td className="prl-col-right prl-net-text">{formatCurrency(run.totals?.netPay || 0)}</td>
                    <td className="prl-col-action" onClick={e => e.stopPropagation()}>
                      <div className="prl-kebab-wrap" ref={menuOpen === run._id ? menuRef : undefined}>
                        <button className="prl-kebab" onClick={() => setMenuOpen(menuOpen === run._id ? null : run._id)}>
                          <IconDotsVertical size={16} />
                        </button>
                        {menuOpen === run._id && (
                          <div className="prl-menu">
                            <button className="prl-menu-item" onClick={() => { setMenuOpen(null); navigate(`/payroll/run/${run._id}`); }}>
                              <IconFileSpreadsheet size={14} /> View payslips
                            </button>
                            <button className="prl-menu-item" onClick={() => setMenuOpen(null)}>
                              <IconDownload size={14} /> Download
                            </button>
                            {run.status !== 'PAID' && (
                              <button className="prl-menu-item" onClick={() => setMenuOpen(null)}>
                                <IconRefresh size={14} /> Re-run
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── New run modal ────────────────────────────────────── */}
      {showModal && (
        <div className="prl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="prl-modal" onClick={e => e.stopPropagation()}>
            <h3 className="prl-modal-title">New Payroll Run</h3>
            <div className="prl-form-group">
              <label className="prl-form-label">Month</label>
              <select className="prl-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="prl-form-group">
              <label className="prl-form-label">Year</label>
              <input className="prl-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
            </div>
            <div className="prl-form-group">
              <label className="prl-form-label">Pay Group</label>
              <select className="prl-select" value={groupId} onChange={e => setGroupId(e.target.value)}>
                {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
              </select>
            </div>
            <div className="prl-modal-actions">
              <button className="prl-btn-primary" onClick={createRun}>Create</button>
              <button className="prl-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
