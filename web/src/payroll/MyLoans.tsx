import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './MyLoans.css';

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

interface EMI { period: { month: number; year: number }; amount: number; status: string }
interface Loan { _id: string; label: string; principal: number; emiAmount: number; tenureMonths: number; schedule: EMI[]; status: string; createdAt: string }

export function MyLoans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed('/loans/me').then(setLoans).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="ml-page">Loading...</div>;

  return (
    <div className="ml-page">
      <h1 className="ml-title">My Loans & Advances</h1>
      {loans.length === 0 && <div className="ml-empty">No loans or advances.</div>}
      {loans.map(loan => {
        const paid = loan.schedule.filter(e => e.status === 'paid');
        const due = loan.schedule.filter(e => e.status === 'due');
        const paidAmount = paid.reduce((s, e) => s + e.amount, 0);
        const remaining = due.reduce((s, e) => s + e.amount, 0);
        const progress = loan.schedule.length > 0 ? (paid.length / loan.schedule.length) * 100 : 0;
        return (
          <div key={loan._id} className="ml-card">
            <div className="ml-card-header">
              <div className="ml-card-name">{loan.label || 'Loan'}</div>
              <span className={`ml-status ml-status-${loan.status}`}>{loan.status}</span>
            </div>
            <div className="ml-stats">
              <div className="ml-stat"><span className="ml-stat-label">Principal</span><span className="ml-stat-val">{fmt(loan.principal)}</span></div>
              <div className="ml-stat"><span className="ml-stat-label">EMI</span><span className="ml-stat-val">{fmt(loan.emiAmount)}/mo</span></div>
              <div className="ml-stat"><span className="ml-stat-label">Tenure</span><span className="ml-stat-val">{loan.tenureMonths} months</span></div>
              <div className="ml-stat"><span className="ml-stat-label">Paid</span><span className="ml-stat-val">{fmt(paidAmount)}</span></div>
              <div className="ml-stat"><span className="ml-stat-label">Remaining</span><span className="ml-stat-val">{fmt(remaining)}</span></div>
            </div>
            <div className="ml-progress-bar">
              <div className="ml-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="ml-progress-text">{paid.length}/{loan.schedule.length} EMIs paid</div>
            {due.length > 0 && loan.status === 'active' && (
              <div className="ml-next">
                Next EMI: {fmt(due[0].amount)} in {due[0].period.month}/{due[0].period.year}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
