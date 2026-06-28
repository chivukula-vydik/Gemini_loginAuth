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
  taskProgress: { done: number; total: number };
}

interface Stats {
  activeCases: number;
  joiningSoon: number;
  overdueTasks: number;
  completedThisQuarter: number;
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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  OFFER_SENT: '#3b82f6',
  OFFER_ACCEPTED: '#14b8a6',
  PRE_BOARDING: '#f59e0b',
  JOINED: '#22c55e',
  INDUCTION: '#6366f1',
  PROBATION: '#8b5cf6',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  OFFER_SENT: 'Offer Sent',
  OFFER_ACCEPTED: 'Accepted',
  PRE_BOARDING: 'Pre-boarding',
  JOINED: 'Joined',
  INDUCTION: 'Induction',
  PROBATION: 'Probation',
};

const AVATAR_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(first: string, last: string): string {
  return ((first[0] || '') + (last[0] || '')).toUpperCase();
}

export function OnboardingBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      authed('/onboarding'),
      authed('/onboarding/stats'),
    ]).then(([c, s]) => {
      setCases(c);
      setStats(s);
      setLoaded(true);
    });
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
    setCases(prev => [{ ...c, taskProgress: { done: 0, total: 0 } }, ...prev]);
    setStats(prev => prev ? { ...prev, activeCases: prev.activeCases + 1 } : prev);
    setShowCreate(false);
    setForm({ firstName: '', lastName: '', personalEmail: '', phone: '', designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time' });
  }

  if (!loaded) return <div className="ob-page"><div className="ob-empty">Loading...</div></div>;

  const hasCases = cases.length > 0;

  return (
    <div className="ob-page">
      <div className="ob-title">
        <span>Onboarding</span>
        <button className="pr-btn" onClick={() => setShowCreate(true)}>New Case</button>
      </div>

      {hasCases && stats && (
        <div className="ob-stats-row">
          <div className="ob-stat-card">
            <span className="ob-stat-value ob-stat--blue">{stats.activeCases}</span>
            <span className="ob-stat-label">in pipeline</span>
          </div>
          <div className="ob-stat-card">
            <span className="ob-stat-value ob-stat--green">{stats.joiningSoon}</span>
            <span className="ob-stat-label">next 7 days</span>
          </div>
          <div className="ob-stat-card">
            <span className={`ob-stat-value ${stats.overdueTasks > 0 ? 'ob-stat--red' : 'ob-stat--grey'}`}>{stats.overdueTasks}</span>
            <span className="ob-stat-label">need attention</span>
          </div>
          <div className="ob-stat-card">
            <span className="ob-stat-value ob-stat--purple">{stats.completedThisQuarter}</span>
            <span className="ob-stat-label">this quarter</span>
          </div>
        </div>
      )}

      {hasCases ? (
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
                  {items.map(c => {
                    const pct = c.taskProgress.total > 0 ? Math.round((c.taskProgress.done / c.taskProgress.total) * 100) : 0;
                    return (
                      <div key={c._id} className="ob-card" onClick={() => navigate(`/onboarding/${c._id}`)}>
                        <div className="ob-card-top">
                          <div className="ob-card-avatar" style={{ background: colorFor(c._id) }}>
                            {initials(c.candidate.firstName, c.candidate.lastName)}
                          </div>
                          <div className="ob-card-info">
                            <div className="ob-card-name">{c.candidate.firstName} {c.candidate.lastName}</div>
                            <div className="ob-card-role">{c.designation}{c.department ? ` — ${c.department.name}` : ''}</div>
                          </div>
                          <span className="ob-status-badge" style={{ background: `${STATUS_COLORS[c.status] || '#6b7280'}20`, color: STATUS_COLORS[c.status] || '#6b7280' }}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                        </div>
                        {c.taskProgress.total > 0 && (
                          <div className="ob-card-progress">
                            <div className="ob-progress-bar">
                              <div className="ob-progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="ob-progress-text">{c.taskProgress.done}/{c.taskProgress.total} tasks</span>
                          </div>
                        )}
                        <div className="ob-card-footer">
                          <span className="ob-card-date-pill">
                            {new Date(c.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {c.reportingManager && (
                            <span className="ob-card-rm">RM: {c.reportingManager.displayName}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="ob-col-empty">No cases</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ob-empty-state">
          <svg className="ob-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M12 11v6M9 14h6" />
          </svg>
          <h2 className="ob-empty-heading">No onboarding cases yet</h2>
          <div className="ob-empty-steps">
            <div className="ob-empty-step">
              <span className="ob-step-num">1</span>
              <div>
                <div className="ob-step-title">Create a case</div>
                <div className="ob-step-desc">Add candidate details and designation</div>
              </div>
            </div>
            <div className="ob-empty-step">
              <span className="ob-step-num">2</span>
              <div>
                <div className="ob-step-title">Send an offer</div>
                <div className="ob-step-desc">Move to Offer Sent stage</div>
              </div>
            </div>
            <div className="ob-empty-step">
              <span className="ob-step-num">3</span>
              <div>
                <div className="ob-step-title">Track progress</div>
                <div className="ob-step-desc">Monitor tasks and documents</div>
              </div>
            </div>
          </div>
          <button className="pr-btn ob-empty-cta" onClick={() => setShowCreate(true)}>Create First Case</button>
        </div>
      )}

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
