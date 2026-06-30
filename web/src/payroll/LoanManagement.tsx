import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './LoanManagement.css';

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

interface EMI { period: { month: number; year: number }; amount: number; status: string }
interface UserRef { _id: string; displayName: string; email: string }
interface Loan { _id: string; user: UserRef; label: string; loanType: string; principal: number; emiAmount: number; tenureMonths: number; schedule: EMI[]; status: string; createdAt: string }

const TYPE_LABELS: Record<string, string> = { home_loan: 'Home Loan', education_loan: 'Education Loan', ev_loan: 'EV Loan', salary_advance: 'Salary Advance', other: 'Other' };
const TAX_DEDUCTIBLE = ['home_loan', 'education_loan', 'ev_loan'];

export function LoanManagement() {
  const navigate = useNavigate();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    authed(`/loans/all?status=${filter}`).then(setLoans).catch(() => {}).finally(() => setLoaded(true));
  }
  useEffect(load, [filter]);

  async function action(id: string, act: string, body?: unknown) {
    setBusy(true);
    setMsg('');
    try {
      await authed(`/loans/${id}/${act}`, 'POST', body);
      load();
      setMsg(`Loan ${act}d`);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
    setBusy(false);
  }

  async function prepay(id: string) {
    const amtStr = prompt('Prepayment amount:');
    if (!amtStr) return;
    const amount = Number(amtStr);
    if (!amount || amount <= 0) return;
    await action(id, 'prepay', { amount });
  }

  if (!loaded) return <div className="lm-page">Loading...</div>;

  return (
    <div className="lm-page">
      <div className="lm-header">
        <button className="lm-back" onClick={() => navigate('/payroll')}>← Back</button>
        <h1 className="lm-title">Loan & Advance Management</h1>
      </div>

      <div className="lm-filters">
        {['active', 'paused', 'closed'].map(s => (
          <button key={s} className={`lm-filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>

      {msg && <div className="lm-msg">{msg}</div>}
      {loans.length === 0 && <div className="lm-empty">No {filter} loans.</div>}

      {loans.map(loan => {
        const paid = loan.schedule.filter(e => e.status === 'paid');
        const due = loan.schedule.filter(e => e.status === 'due');
        const paidAmt = paid.reduce((s, e) => s + e.amount, 0);
        const remaining = due.reduce((s, e) => s + e.amount, 0);
        const isExpanded = expanded === loan._id;
        return (
          <div key={loan._id} className="lm-card">
            <div className="lm-card-header" onClick={() => setExpanded(isExpanded ? null : loan._id)}>
              <div>
                <div className="lm-card-name">{loan.user.displayName}</div>
                <div className="lm-card-sub">
                  {loan.label || 'Loan'} · {TYPE_LABELS[loan.loanType] || loan.loanType}
                  {TAX_DEDUCTIBLE.includes(loan.loanType) && <span className="lm-tax-badge">Tax Deductible</span>}
                  {' · '}{fmt(loan.principal)} · {loan.tenureMonths}mo
                </div>
              </div>
              <div className="lm-card-right">
                <span className={`lm-status lm-status-${loan.status}`}>{loan.status}</span>
                <span className="lm-card-remaining">{fmt(remaining)} left</span>
                <span className="lm-chevron">{isExpanded ? '▾' : '▸'}</span>
              </div>
            </div>
            {isExpanded && (
              <div className="lm-card-body">
                <div className="lm-progress-info">
                  <span>{paid.length}/{loan.schedule.length} EMIs paid ({fmt(paidAmt)})</span>
                  <span>{fmt(remaining)} remaining</span>
                </div>
                <div className="lm-progress-bar"><div className="lm-progress-fill" style={{ width: `${loan.schedule.length ? (paid.length / loan.schedule.length) * 100 : 0}%` }} /></div>

                <div className="lm-schedule">
                  {loan.schedule.map((emi, i) => (
                    <div key={i} className={`lm-emi lm-emi-${emi.status}`}>
                      <span>{emi.period.month}/{emi.period.year}</span>
                      <span>{fmt(emi.amount)}</span>
                      <span className={`lm-emi-badge lm-emi-badge-${emi.status}`}>{emi.status}</span>
                    </div>
                  ))}
                </div>

                <div className="lm-actions">
                  {loan.status === 'active' && (
                    <>
                      <button className="lm-btn" disabled={busy} onClick={() => action(loan._id, 'pause')}>Pause</button>
                      <button className="lm-btn" disabled={busy} onClick={() => prepay(loan._id)}>Prepay</button>
                      <button className="lm-btn lm-btn-danger" disabled={busy} onClick={() => action(loan._id, 'close')}>Close</button>
                    </>
                  )}
                  {loan.status === 'paused' && (
                    <button className="lm-btn lm-btn-primary" disabled={busy} onClick={() => action(loan._id, 'resume')}>Resume</button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
