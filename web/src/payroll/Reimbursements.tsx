// web/src/payroll/Reimbursements.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './Reimbursements.css';

interface Claim {
  _id: string;
  category: string;
  amount: number;
  claimDate: string;
  description: string;
  status: string;
}

const CATEGORIES = ['travel', 'food', 'internet', 'medical', 'other'];

export function Reimbursements() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [category, setCategory] = useState('travel');
  const [amount, setAmount] = useState(0);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed('/reimbursements/me').then(d => { setClaims(d); setLoaded(true); });
  }, []);

  async function submit() {
    setSubmitting(true);
    const claim = await authed('/reimbursements', 'POST', { category, amount, claimDate, description });
    setClaims(prev => [claim, ...prev]);
    setAmount(0);
    setDescription('');
    setSubmitting(false);
  }

  if (!loaded) return <div className="rb-page"><div className="rb-empty">Loading...</div></div>;

  return (
    <div className="rb-page">
      <h1 className="rb-title">Reimbursements</h1>

      <div className="rb-submit-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>New Claim</div>
        <div className="rb-form-row">
          <div className="rb-form-group">
            <label className="rb-form-label">Category</label>
            <select className="se-select" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div className="rb-form-group">
            <label className="rb-form-label">Amount</label>
            <input className="se-input" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <div className="rb-form-row">
          <div className="rb-form-group">
            <label className="rb-form-label">Date</label>
            <input className="se-input" type="date" value={claimDate} onChange={e => setClaimDate(e.target.value)} />
          </div>
          <div className="rb-form-group">
            <label className="rb-form-label">Description</label>
            <input className="se-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" />
          </div>
        </div>
        <button className="pr-btn" onClick={submit} disabled={submitting || !amount}>{submitting ? 'Submitting...' : 'Submit Claim'}</button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>My Claims</div>
      {claims.length === 0 ? (
        <div className="rb-empty">No claims yet.</div>
      ) : (
        <div className="rb-list">
          {claims.map(c => (
            <div key={c._id} className="rb-item">
              <div className="rb-item-info">
                <span className="rb-item-cat">{c.category}</span>
                <span className="rb-item-desc">{c.description || c.claimDate}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="rb-item-amount">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.amount)}</span>
                <span className={`rb-item-status ${c.status}`}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
