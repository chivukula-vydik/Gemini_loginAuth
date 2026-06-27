// web/src/payroll/ReimbursementApprovals.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './ReimbursementApprovals.css';

interface PendingClaim {
  _id: string;
  user: { displayName: string; email: string; employeeCode: string };
  category: string;
  amount: number;
  claimDate: string;
  description: string;
}

export function ReimbursementApprovals() {
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed('/reimbursements/pending').then(d => { setClaims(d); setLoaded(true); });
  }, []);

  async function approve(id: string) {
    await authed(`/reimbursements/${id}/approve`, 'POST');
    setClaims(prev => prev.filter(c => c._id !== id));
  }

  async function reject(id: string) {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    await authed(`/reimbursements/${id}/reject`, 'POST', { reason });
    setClaims(prev => prev.filter(c => c._id !== id));
  }

  if (!loaded) return <div className="ra-page">Loading...</div>;

  return (
    <div className="ra-page">
      <h1 className="ra-title">Reimbursement Approvals</h1>
      {claims.length === 0 ? (
        <div className="rb-empty">No pending claims.</div>
      ) : (
        claims.map(c => (
          <div key={c._id} className="ra-item">
            <div className="ra-info">
              <div className="ra-name">{c.user?.displayName || '—'}</div>
              <div className="ra-meta">{c.category} · {c.description || c.claimDate}</div>
            </div>
            <span className="ra-amount">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.amount)}</span>
            <div className="ra-actions">
              <button className="ra-approve" onClick={() => approve(c._id)}>Approve</button>
              <button className="ra-reject" onClick={() => reject(c._id)}>Reject</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
