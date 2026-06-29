import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed, authedRaw } from '../fetchHelper';
import './OnboardingBoard.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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

interface Task { _id: string; templateKey: string; title: string; ownerRole: string; assignedTo?: { displayName: string }; dueDate: string; status: string; blocked: boolean; mandatory: boolean; }
interface Doc { _id: string; docType: string; mandatory: boolean; verifyStatus: string; submission?: { fileId: string; filename: string; size: number }; rejectionReason?: string; }
interface Offer { _id: string; version: number; ctcAnnual: number; componentsPreview: { key: string; label: string; type: string; calc: string; value: number }[]; status: string; sentAt?: string; respondedAt?: string; }
interface CaseDetail {
  _id: string; candidate: { firstName: string; lastName: string; personalEmail: string; phone: string };
  designation: string; department?: { name: string }; reportingManager?: { displayName: string };
  payGrade?: { code: string; label: string }; payGroup?: { name: string };
  workLocation: string; employmentType: string; joiningDate: string; probationMonths: number;
  status: string; offer?: Offer; tasks: Task[]; documents: Doc[]; readyToConvert: boolean;
}

const HIRING_STAGES = [
  { status: 'DRAFT', label: 'Draft', color: '#6b7280' },
  { status: 'OFFER_SENT', label: 'Offer Sent', color: '#3b82f6' },
  { status: 'OFFER_ACCEPTED', label: 'Accepted', color: '#14b8a6' },
  { status: 'PRE_BOARDING', label: 'Pre-boarding', color: '#f59e0b' },
];

const ONBOARDING_STAGES = [
  { status: 'JOINED', label: 'Joined', color: '#22c55e' },
  { status: 'INDUCTION', label: 'Induction', color: '#6366f1' },
  { status: 'PROBATION', label: 'Probation', color: '#8b5cf6' },
];

const ALL_STAGES = [...HIRING_STAGES, ...ONBOARDING_STAGES];

const NEXT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CANCELLED'],
  OFFER_SENT: ['CANCELLED'],
  OFFER_ACCEPTED: ['PRE_BOARDING', 'CANCELLED'],
  PRE_BOARDING: ['JOINED', 'CANCELLED'],
  INDUCTION: ['PROBATION'],
};

const DETAIL_TABS = ['Overview', 'Offer', 'Tasks', 'Documents'];

const AVATAR_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(first: string, last: string): string {
  return ((first[0] || '') + (last[0] || '')).toUpperCase();
}

function CheckSvg() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

/* ─── Inline detail panel ──────────────────────────────────────────────── */
function InlineDetail({ id, onStatusChange }: { id: string; onStatusChange: () => void }) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState('Overview');
  const [busy, setBusy] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocId, setUploadDocId] = useState<string | null>(null);

  const load = () => authed(`/onboarding/${id}`).then(setData);
  useEffect(() => { load(); }, [id]);

  async function transition(to: string) {
    setBusy(true);
    await authed(`/onboarding/${id}/transition`, 'POST', { to });
    await load();
    onStatusChange();
    setBusy(false);
  }

  async function completeTask(taskId: string) {
    await authed(`/onboarding/tasks/${taskId}/complete`, 'POST');
    await load();
    onStatusChange();
  }

  async function verifyDoc(docId: string) {
    await authed(`/onboarding/documents/${docId}/verify`, 'POST');
    await load();
  }

  async function rejectDoc(docId: string) {
    const reason = prompt('Rejection reason:');
    if (reason === null) return;
    await authed(`/onboarding/documents/${docId}/reject`, 'POST', { reason });
    await load();
  }

  async function uploadDoc(docId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docId', docId);
    await authedRaw(`/onboarding/${id}/documents`, 'POST', fd);
    await load();
  }

  function triggerUpload(docId: string) {
    setUploadDocId(docId);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && uploadDocId) uploadDoc(uploadDocId, file);
    e.target.value = '';
    setUploadDocId(null);
  }

  async function createOffer() {
    const ctc = prompt('Annual CTC:');
    if (!ctc) return;
    await authed(`/onboarding/${id}/offer`, 'POST', { ctcAnnual: Number(ctc), componentsPreview: [] });
    await load();
  }

  async function sendOffer() {
    setBusy(true);
    const res = await authed(`/onboarding/${id}/offer/send`, 'POST');
    const fullLink = `${window.location.origin}${res.portalLink}`;
    setPortalLink(fullLink);
    setCopied(false);
    await load();
    onStatusChange();
    setBusy(false);
  }

  function copyPortalLink() {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function convert() {
    if (!confirm('This will create a real employee account. Proceed?')) return;
    setBusy(true);
    await authed(`/onboarding/${id}/convert`, 'POST');
    await load();
    onStatusChange();
    setBusy(false);
  }

  async function confirmAction(action: string) {
    setBusy(true);
    const body: Record<string, unknown> = { action };
    if (action === 'extend') {
      const months = prompt('Extension months:', '3');
      if (!months) { setBusy(false); return; }
      body.extensionMonths = Number(months);
    }
    await authed(`/onboarding/${id}/confirm`, 'POST', body);
    await load();
    onStatusChange();
    setBusy(false);
  }

  if (!data) return <div className="ob-detail-loading">Loading details...</div>;

  const nextMoves = NEXT_TRANSITIONS[data.status] || [];
  const doneTaskCount = data.tasks.filter(t => t.status === 'done').length;
  const verifiedDocCount = data.documents.filter(d => d.verifyStatus === 'verified').length;
  const joinDate = new Date(data.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="ob-detail">
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} />

      {/* Quick info */}
      <div className="ob-detail-quick">
        <div className="ob-dq-item"><span className="ob-dq-label">Email</span><span className="ob-dq-val">{data.candidate.personalEmail}</span></div>
        <div className="ob-dq-item"><span className="ob-dq-label">Phone</span><span className="ob-dq-val">{data.candidate.phone || '—'}</span></div>
        <div className="ob-dq-item"><span className="ob-dq-label">Joining</span><span className="ob-dq-val">{joinDate}</span></div>
        <div className="ob-dq-item"><span className="ob-dq-label">Offer</span><span className="ob-dq-val">{data.offer?.status?.toUpperCase() || '—'}</span></div>
        <div className="ob-dq-item"><span className="ob-dq-label">Tasks</span><span className="ob-dq-val">{doneTaskCount}/{data.tasks.length}</span></div>
        <div className="ob-dq-item"><span className="ob-dq-label">Docs</span><span className="ob-dq-val">{verifiedDocCount}/{data.documents.length}</span></div>
      </div>

      {/* Tabs */}
      <div className="ob-detail-tabs">
        {DETAIL_TABS.map(t => (
          <button key={t} className={`ob-detail-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div className="ob-detail-body">
        {tab === 'Overview' && (
          <div className="ob-detail-overview">
            <div className="ob-detail-fields">
              <div className="ob-df"><span className="ob-df-lbl">Employment</span><span className="ob-df-val">{data.employmentType.replace(/_/g, ' ')}</span></div>
              <div className="ob-df"><span className="ob-df-lbl">Probation</span><span className="ob-df-val">{data.probationMonths} months</span></div>
              <div className="ob-df"><span className="ob-df-lbl">Manager</span><span className="ob-df-val">{data.reportingManager?.displayName || '—'}</span></div>
              <div className="ob-df"><span className="ob-df-lbl">Pay Grade</span><span className="ob-df-val">{data.payGrade ? `${data.payGrade.code} — ${data.payGrade.label}` : '—'}</span></div>
              <div className="ob-df"><span className="ob-df-lbl">Location</span><span className="ob-df-val">{data.workLocation || '—'}</span></div>
              <div className="ob-df"><span className="ob-df-lbl">Department</span><span className="ob-df-val">{data.department?.name || '—'}</span></div>
            </div>

            {nextMoves.length > 0 && (
              <div className="ob-detail-actions">
                {nextMoves.map(to => (
                  <button key={to} className={`ob-da-btn ${to === 'CANCELLED' ? 'danger' : 'primary'}`} disabled={busy} onClick={() => transition(to)}>
                    {to.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}

            {data.status === 'JOINED' && (
              <div className="ob-detail-gate">
                <div className="ob-gate-row">
                  <div className={`ob-gate-dot ${data.offer?.status === 'accepted' ? 'pass' : 'fail'}`}>{data.offer?.status === 'accepted' ? <CheckSvg /> : '—'}</div>
                  Offer accepted
                </div>
                <div className="ob-gate-row">
                  <div className={`ob-gate-dot ${data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? 'pass' : 'fail'}`}>
                    {data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? <CheckSvg /> : '—'}
                  </div>
                  All mandatory docs verified
                </div>
                <div className="ob-gate-row">
                  <div className={`ob-gate-dot ${data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? 'pass' : 'fail'}`}>
                    {data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? <CheckSvg /> : '—'}
                  </div>
                  All mandatory tasks complete
                </div>
                <button className="ob-da-btn primary" disabled={!data.readyToConvert || busy} onClick={convert} style={{ marginTop: 10 }}>Convert to Employee</button>
              </div>
            )}

            {data.status === 'PROBATION' && (
              <div className="ob-detail-actions">
                <button className="ob-da-btn primary" disabled={busy} onClick={() => confirmAction('confirm')}>Confirm</button>
                <button className="ob-da-btn" disabled={busy} onClick={() => confirmAction('extend')}>Extend</button>
                <button className="ob-da-btn danger" disabled={busy} onClick={() => confirmAction('terminate')}>Terminate</button>
              </div>
            )}
          </div>
        )}

        {tab === 'Offer' && (
          <div>
            {data.offer ? (
              <>
                <div className="ob-offer-hero">
                  <span className="ob-offer-ctc">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.offer.ctcAnnual)}</span>
                  <span className="ob-offer-per"> / year</span>
                  <span className={`ob-offer-pill ${data.offer.status}`}>{data.offer.status}</span>
                </div>
                {data.offer.componentsPreview.length > 0 && (
                  <table className="ob-comp-table">
                    <thead><tr><th>Component</th><th>Type</th><th>Calc</th><th>Value</th></tr></thead>
                    <tbody>{data.offer.componentsPreview.map((c, i) => <tr key={i}><td>{c.label}</td><td>{c.type}</td><td>{c.calc.replace(/_/g, ' ')}</td><td>{c.value}</td></tr>)}</tbody>
                  </table>
                )}
                {data.offer.status === 'draft' && (
                  <div className="ob-detail-actions"><button className="ob-da-btn primary" disabled={busy} onClick={sendOffer}>Send Offer</button></div>
                )}
                {portalLink && data.offer.status === 'sent' && (
                  <div className="ob-portal-box">
                    <div className="ob-portal-label">Portal link sent to candidate</div>
                    <div className="ob-portal-row">
                      <input className="ob-portal-input" readOnly value={portalLink} onClick={e => (e.target as HTMLInputElement).select()} />
                      <button className="ob-da-btn primary" onClick={copyPortalLink}>{copied ? 'Copied!' : 'Copy'}</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="ob-detail-empty">
                <p>No offer created yet.</p>
                <button className="ob-da-btn primary" onClick={createOffer}>Create Offer</button>
              </div>
            )}
          </div>
        )}

        {tab === 'Tasks' && (
          <div>
            {data.tasks.length === 0 ? (
              <div className="ob-detail-empty">No tasks yet. Transition to PRE_BOARDING to create them.</div>
            ) : (
              <div className="ob-task-list">
                {data.tasks.map(t => (
                  <div key={t._id} className={`ob-task-row ${t.status === 'done' ? 'done' : ''}`}>
                    <input type="checkbox" className="ob-task-chk" checked={t.status === 'done'} disabled={t.status === 'done' || t.blocked} onChange={() => completeTask(t._id)} />
                    <span className={`ob-task-name ${t.status === 'done' ? 'done' : ''}`}>{t.title}</span>
                    {t.assignedTo && <span className="ob-task-meta">{t.assignedTo.displayName}</span>}
                    {t.dueDate && <span className="ob-task-meta">{new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                    <span className={`ob-task-pill ${t.blocked ? 'blocked' : t.status}`}>{t.blocked ? 'blocked' : t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'Documents' && (
          <div>
            {data.documents.length === 0 ? (
              <div className="ob-detail-empty">No document requests yet.</div>
            ) : (
              <div className="ob-doc-list">
                {data.documents.map(d => (
                  <div key={d._id} className="ob-doc-row">
                    <div className={`ob-doc-icon ${d.verifyStatus}`}>
                      {d.verifyStatus === 'verified' ? <CheckSvg /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>}
                    </div>
                    <div className="ob-doc-info">
                      <div className="ob-doc-name">{d.docType.replace(/_/g, ' ')}</div>
                      {d.submission?.filename && <a href={`${API}/onboarding/documents/${d.submission.fileId}/download`} target="_blank" rel="noreferrer" className="ob-doc-file">{d.submission.filename}</a>}
                      {d.rejectionReason && <div className="ob-doc-reject">Rejected: {d.rejectionReason}</div>}
                    </div>
                    <span className={`ob-doc-badge ${d.verifyStatus}`}>{d.verifyStatus}</span>
                    {d.verifyStatus === 'submitted' && (
                      <>
                        <button className="ob-da-btn primary small" onClick={() => verifyDoc(d._id)}>Verify</button>
                        <button className="ob-da-btn danger small" onClick={() => rejectDoc(d._id)}>Reject</button>
                      </>
                    )}
                    {(d.verifyStatus === 'awaiting' || d.verifyStatus === 'rejected') && (
                      <button className="ob-da-btn small" onClick={() => triggerUpload(d._id)}>Upload</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Board ───────────────────────────────────────────────────────── */
export function OnboardingBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  function loadAll() {
    return Promise.all([
      authed('/onboarding'),
      authed('/onboarding/stats'),
    ]).then(([c, s]) => {
      setCases(c);
      setStats(s);
      return c;
    });
  }

  useEffect(() => {
    loadAll().then(c => {
      setLoaded(true);
      const firstWithCases = ALL_STAGES.find(st => c.some((cs: Case) => cs.status === st.status));
      if (firstWithCases) setActiveStage(firstWithCases.status);
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
    setActiveStage('DRAFT');
    setExpandedId(c._id);
    setShowCreate(false);
    setForm({ firstName: '', lastName: '', personalEmail: '', phone: '', designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time' });
  }

  function handleStatusChange() {
    loadAll();
  }

  if (!loaded) return <div className="ob-page"><div className="ob-loading">Loading...</div></div>;

  const hasCases = cases.length > 0;
  const countByStatus = (status: string) => cases.filter(c => c.status === status).length;
  const filteredCases = activeStage ? cases.filter(c => c.status === activeStage) : cases;
  const activeLabel = ALL_STAGES.find(s => s.status === activeStage)?.label || 'All';

  function renderRail(stages: typeof HIRING_STAGES) {
    return stages.map((stage, i) => {
      const count = countByStatus(stage.status);
      const isActive = activeStage === stage.status;
      return (
        <div key={stage.status} className="ob-rail-stage-wrap">
          {i > 0 && <div className="ob-rail-connector" />}
          <button
            className={`ob-rail-node ${isActive ? 'active' : ''} ${count > 0 ? 'has-cases' : ''}`}
            style={{ '--stage-color': stage.color } as React.CSSProperties}
            onClick={() => { setActiveStage(stage.status); setExpandedId(null); }}
          >
            <span className="ob-rail-count">{count}</span>
          </button>
          <span className={`ob-rail-label ${isActive ? 'active' : ''}`}>{stage.label}</span>
        </div>
      );
    });
  }

  function toggleExpand(caseId: string) {
    setExpandedId(prev => prev === caseId ? null : caseId);
  }

  return (
    <div className="ob-page">
      {/* Header */}
      <div className="ob-header">
        <div>
          <h1 className="ob-title">Onboarding</h1>
          <p className="ob-subtitle">{cases.length} total candidates in pipeline</p>
        </div>
        <button className="ob-new-btn" onClick={() => setShowCreate(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Case
        </button>
      </div>

      {/* Stats strip */}
      {hasCases && stats && (
        <div className="ob-stats">
          <div className="ob-stat"><span className="ob-stat-num blue">{stats.activeCases}</span><span className="ob-stat-lbl">In Pipeline</span></div>
          <div className="ob-stat-divider" />
          <div className="ob-stat"><span className="ob-stat-num green">{stats.joiningSoon}</span><span className="ob-stat-lbl">Joining 7d</span></div>
          <div className="ob-stat-divider" />
          <div className="ob-stat"><span className="ob-stat-num red">{stats.overdueTasks}</span><span className="ob-stat-lbl">Overdue</span></div>
          <div className="ob-stat-divider" />
          <div className="ob-stat"><span className="ob-stat-num purple">{stats.completedThisQuarter}</span><span className="ob-stat-lbl">This Qtr</span></div>
        </div>
      )}

      {hasCases ? (
        <>
          {/* Pipeline rail */}
          <div className="ob-pipeline">
            <div className="ob-pipeline-phase">
              <div className="ob-phase-label">Hiring</div>
              <div className="ob-rail">{renderRail(HIRING_STAGES)}</div>
            </div>
            <div className="ob-pipeline-arrow">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
            </div>
            <div className="ob-pipeline-phase">
              <div className="ob-phase-label">Onboarding</div>
              <div className="ob-rail">{renderRail(ONBOARDING_STAGES)}</div>
            </div>
          </div>

          {/* Case list */}
          <div className="ob-list-section">
            <div className="ob-list-header">
              <h2 className="ob-list-title">{activeLabel}</h2>
              <div className="ob-list-right">
                <span className="ob-list-count">{filteredCases.length} candidate{filteredCases.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {filteredCases.length > 0 ? (
              <div className="ob-case-list">
                {filteredCases.map(c => {
                  const pct = c.taskProgress.total > 0 ? Math.round((c.taskProgress.done / c.taskProgress.total) * 100) : 0;
                  const stage = ALL_STAGES.find(s => s.status === c.status);
                  const isExpanded = expandedId === c._id;
                  return (
                    <div key={c._id} className={`ob-case-item ${isExpanded ? 'expanded' : ''}`}>
                      <div className="ob-case-row" onClick={() => toggleExpand(c._id)}>
                        <div className="ob-case-avatar" style={{ background: colorFor(c._id) }}>
                          {initials(c.candidate.firstName, c.candidate.lastName)}
                        </div>
                        <div className="ob-case-info">
                          <div className="ob-case-name">{c.candidate.firstName} {c.candidate.lastName}</div>
                          <div className="ob-case-role">{c.designation}{c.department ? ` — ${c.department.name}` : ''}</div>
                        </div>
                        <div className="ob-case-meta">
                          <div className="ob-case-date">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            {new Date(c.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          {c.reportingManager && <div className="ob-case-rm">{c.reportingManager.displayName}</div>}
                        </div>
                        {c.taskProgress.total > 0 && (
                          <div className="ob-case-progress">
                            <div className="ob-case-pbar"><div className="ob-case-pfill" style={{ width: `${pct}%` }} /></div>
                            <span className="ob-case-ptxt">{c.taskProgress.done}/{c.taskProgress.total}</span>
                          </div>
                        )}
                        <span className="ob-case-badge" style={{ background: `${stage?.color || '#6b7280'}18`, color: stage?.color || '#6b7280' }}>
                          {stage?.label || c.status}
                        </span>
                        <svg className={`ob-case-chevron ${isExpanded ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6,9 12,15 18,9"/></svg>
                      </div>
                      {isExpanded && <InlineDetail id={c._id} onStatusChange={handleStatusChange} />}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ob-list-empty">
                <div className="ob-list-empty-icon">0</div>
                No candidates at this stage
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="ob-empty-state">
          <svg className="ob-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M12 11v6M9 14h6" />
          </svg>
          <h2 className="ob-empty-heading">No onboarding cases yet</h2>
          <div className="ob-empty-steps">
            <div className="ob-empty-step"><span className="ob-step-num">1</span><div><div className="ob-step-title">Create a case</div><div className="ob-step-desc">Add candidate details and designation</div></div></div>
            <div className="ob-empty-step"><span className="ob-step-num">2</span><div><div className="ob-step-title">Send an offer</div><div className="ob-step-desc">Move to Offer Sent stage</div></div></div>
            <div className="ob-empty-step"><span className="ob-step-num">3</span><div><div className="ob-step-title">Track progress</div><div className="ob-step-desc">Monitor tasks and documents</div></div></div>
          </div>
          <button className="ob-new-btn" onClick={() => setShowCreate(true)}>Create First Case</button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="ob-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="ob-modal">
            <div className="ob-modal-header">
              <h2 className="ob-modal-title">New Onboarding Case</h2>
              <button className="ob-modal-close" onClick={() => setShowCreate(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="ob-modal-body">
              <div className="ob-form-row">
                <div className="ob-form-group"><label className="ob-form-label">First Name</label><input className="ob-input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                <div className="ob-form-group"><label className="ob-form-label">Last Name</label><input className="ob-input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
              </div>
              <div className="ob-form-row">
                <div className="ob-form-group"><label className="ob-form-label">Email</label><input className="ob-input" type="email" value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))} /></div>
                <div className="ob-form-group"><label className="ob-form-label">Phone</label><input className="ob-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div className="ob-form-row">
                <div className="ob-form-group"><label className="ob-form-label">Designation</label><input className="ob-input" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} /></div>
                <div className="ob-form-group"><label className="ob-form-label">Joining Date</label><input className="ob-input" type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} /></div>
              </div>
              <div className="ob-form-row">
                <div className="ob-form-group"><label className="ob-form-label">Employment Type</label>
                  <select className="ob-input" value={form.employmentType} onChange={e => setForm(f => ({ ...f, employmentType: e.target.value }))}>
                    <option value="full_time">Full Time</option><option value="contract">Contract</option><option value="intern">Intern</option>
                  </select>
                </div>
                <div className="ob-form-group"><label className="ob-form-label">Probation (months)</label><input className="ob-input" type="number" value={form.probationMonths} onChange={e => setForm(f => ({ ...f, probationMonths: Number(e.target.value) }))} /></div>
              </div>
            </div>
            <div className="ob-modal-footer">
              <button className="ob-btn-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="ob-new-btn" onClick={createCase} disabled={!form.firstName || !form.lastName || !form.personalEmail || !form.joiningDate}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
