import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './OnboardingBoard.css';

interface Case {
  _id: string;
  candidate: { firstName: string; lastName: string; personalEmail: string };
  designation: string;
  department?: { name: string };
  joiningDate: string;
  status: string;
  reportingManager?: { displayName: string };
}

const COLUMNS = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'OFFER_SENT', label: 'Offer Sent' },
  { status: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
  { status: 'PRE_BOARDING', label: 'Pre-boarding' },
  { status: 'JOINED', label: 'Joined' },
  { status: 'INDUCTION', label: 'Induction' },
  { status: 'PROBATION', label: 'Probation' },
];

export function OnboardingBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    authed('/onboarding').then(d => { setCases(d); setLoaded(true); });
  }, []);

  const [form, setForm] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '',
    designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time',
  });

  async function createCase() {
    const body = {
      candidate: { firstName: form.firstName, lastName: form.lastName, personalEmail: form.personalEmail, phone: form.phone },
      designation: form.designation,
      joiningDate: form.joiningDate,
      probationMonths: form.probationMonths,
      employmentType: form.employmentType,
    };
    const c = await authed('/onboarding', 'POST', body);
    setCases(prev => [c, ...prev]);
    setShowCreate(false);
    setForm({ firstName: '', lastName: '', personalEmail: '', phone: '', designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time' });
  }

  if (!loaded) return <div className="ob-page"><div className="ob-empty">Loading...</div></div>;

  return (
    <div className="ob-page">
      <div className="ob-title">
        <span>Onboarding</span>
        <button className="pr-btn" onClick={() => setShowCreate(true)}>New Case</button>
      </div>
      <div className="ob-board">
        {COLUMNS.map(col => {
          const items = cases.filter(c => c.status === col.status);
          return (
            <div key={col.status} className="ob-column">
              <div className="ob-col-header">
                {col.label}
                <span className="ob-col-count">{items.length}</span>
              </div>
              <div className="ob-col-cards">
                {items.map(c => (
                  <div key={c._id} className="ob-card" onClick={() => navigate(`/onboarding/${c._id}`)}>
                    <div className="ob-card-name">{c.candidate.firstName} {c.candidate.lastName}</div>
                    <div className="ob-card-role">{c.designation}{c.department ? ` — ${c.department.name}` : ''}</div>
                    <div className="ob-card-meta">
                      <span className="ob-card-date">{new Date(c.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--faint)', padding: 12 }}>No cases</div>}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <div className="ob-create-modal" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="ob-create-card">
            <div className="ob-create-title">New Onboarding Case</div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">First Name</label>
                <input className="se-input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Last Name</label>
                <input className="se-input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Email</label>
                <input className="se-input" type="email" value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Phone</label>
                <input className="se-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Designation</label>
                <input className="se-input" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Joining Date</label>
                <input className="se-input" type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Employment Type</label>
                <select className="se-select" value={form.employmentType} onChange={e => setForm(f => ({ ...f, employmentType: e.target.value }))}>
                  <option value="full_time">Full Time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Probation (months)</label>
                <input className="se-input" type="number" value={form.probationMonths} onChange={e => setForm(f => ({ ...f, probationMonths: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="pr-btn" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="pr-btn" onClick={createCase} disabled={!form.firstName || !form.lastName || !form.personalEmail || !form.joiningDate}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
