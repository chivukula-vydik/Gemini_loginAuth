import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authed, authedRaw } from '../fetchHelper';
import './CaseDetail.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Task { _id: string; templateKey: string; title: string; ownerRole: string; assignedTo?: { displayName: string }; dueDate: string; status: string; blocked: boolean; mandatory: boolean; }
interface Doc { _id: string; docType: string; mandatory: boolean; verifyStatus: string; submission?: { fileId: string; filename: string; size: number }; rejectionReason?: string; }
interface Offer { _id: string; version: number; ctcAnnual: number; componentsPreview: { key: string; label: string; type: string; calc: string; value: number }[]; status: string; sentAt?: string; respondedAt?: string; }
interface CaseData {
  _id: string; candidate: { firstName: string; lastName: string; personalEmail: string; phone: string };
  designation: string; department?: { name: string }; reportingManager?: { displayName: string };
  payGrade?: { code: string; label: string }; payGroup?: { name: string };
  workLocation: string; employmentType: string; joiningDate: string; probationMonths: number;
  status: string; offer?: Offer; tasks: Task[]; documents: Doc[]; readyToConvert: boolean;
  convertedUser?: string; confirmedAt?: string;
}

const TABS = ['Overview', 'Offer', 'Tasks', 'Documents'];

const NEXT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CANCELLED'],
  OFFER_SENT: ['CANCELLED'],
  OFFER_ACCEPTED: ['PRE_BOARDING', 'CANCELLED'],
  PRE_BOARDING: ['JOINED', 'CANCELLED'],
  INDUCTION: ['PROBATION'],
};

export function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CaseData | null>(null);
  const [tab, setTab] = useState('Overview');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocId, setUploadDocId] = useState<string | null>(null);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => authed(`/onboarding/${id}`).then(setData);
  useEffect(() => { load(); }, [id]);

  async function transition(to: string) {
    setBusy(true);
    await authed(`/onboarding/${id}/transition`, 'POST', { to });
    await load();
    setBusy(false);
  }

  async function completeTask(taskId: string) {
    await authed(`/onboarding/tasks/${taskId}/complete`, 'POST');
    await load();
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
    setBusy(false);
  }

  function copyPortalLink() {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [conversionResult, setConversionResult] = useState<{ setup: { userCreated?: boolean; salaryStructure?: boolean; payGroup?: boolean; leaveBalance?: boolean; declaration?: string; profileCopied?: boolean; welcomeEmailSent?: boolean } } | null>(null);

  async function convert() {
    if (!confirm('This will create a real employee account. Proceed?')) return;
    setBusy(true);
    try {
      const result = await authed(`/onboarding/${id}/convert`, 'POST');
      setConversionResult(result);
    } catch { /* handled by load */ }
    await load();
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
    setBusy(false);
  }

  if (!data) return <div className="cd-page"><div className="cd-loading">Loading...</div></div>;

  const nextMoves = NEXT_TRANSITIONS[data.status] || [];
  const initials = data.candidate.firstName[0] + data.candidate.lastName[0];
  const doneTaskCount = data.tasks.filter(t => t.status === 'done').length;
  const verifiedDocCount = data.documents.filter(d => d.verifyStatus === 'verified').length;
  const joinDate = new Date(data.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="cd-page">
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} />

      {/* Back link */}
      <button className="cd-back" onClick={() => navigate('/onboarding')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12,19 5,12 12,5"/></svg>
        Back to Board
      </button>

      {/* Banner */}
      <div className="cd-banner">
        <div className="cd-banner-bg" />
        <div className="cd-banner-body">
          <div className="cd-banner-avatar">{initials}</div>
          <div className="cd-banner-info">
            <h1 className="cd-banner-name">{data.candidate.firstName} {data.candidate.lastName}</h1>
            <div className="cd-banner-meta">
              <span className="cd-banner-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                {data.designation}
              </span>
              {data.department && <span className="cd-banner-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                {data.department.name}
              </span>}
              <span className="cd-banner-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Joining {joinDate}
              </span>
            </div>
          </div>
          <span className={`cd-banner-status ${data.status === 'CANCELLED' || data.status === 'TERMINATED' ? 'danger' : data.status === 'CONFIRMED' ? 'success' : ''}`}>{data.status.replace(/_/g, ' ')}</span>
        </div>

        {/* Stats strip */}
        <div className="cd-stats-strip">
          <div className="cd-stat-item">
            <div className="cd-stat-val">{data.offer ? data.offer.status.toUpperCase() : '—'}</div>
            <div className="cd-stat-lbl">Offer</div>
          </div>
          <div className="cd-stat-sep" />
          <div className="cd-stat-item">
            <div className="cd-stat-val">{doneTaskCount}/{data.tasks.length}</div>
            <div className="cd-stat-lbl">Tasks Done</div>
          </div>
          <div className="cd-stat-sep" />
          <div className="cd-stat-item">
            <div className="cd-stat-val">{verifiedDocCount}/{data.documents.length}</div>
            <div className="cd-stat-lbl">Docs Verified</div>
          </div>
          <div className="cd-stat-sep" />
          <div className="cd-stat-item">
            <div className="cd-stat-val">{data.candidate.personalEmail}</div>
            <div className="cd-stat-lbl">Email</div>
          </div>
          <div className="cd-stat-sep" />
          <div className="cd-stat-item">
            <div className="cd-stat-val">{data.candidate.phone || '—'}</div>
            <div className="cd-stat-lbl">Phone</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="cd-tabs">
        {TABS.map(t => <button key={t} className={`cd-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {/* Content */}
      <div className="cd-content">
        {tab === 'Overview' && (
          <>
            <div className="cd-two-col">
              <div className="cd-section">
                <div className="cd-section-header">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <div className="cd-section-title">Candidate Details</div>
                </div>
                <div className="cd-field-grid">
                  <div className="cd-field"><div className="cd-field-label">Email</div><div className="cd-field-value">{data.candidate.personalEmail}</div></div>
                  <div className="cd-field"><div className="cd-field-label">Phone</div><div className="cd-field-value">{data.candidate.phone || '—'}</div></div>
                  <div className="cd-field"><div className="cd-field-label">Joining Date</div><div className="cd-field-value">{joinDate}</div></div>
                  <div className="cd-field"><div className="cd-field-label">Probation</div><div className="cd-field-value">{data.probationMonths} months</div></div>
                  <div className="cd-field"><div className="cd-field-label">Employment</div><div className="cd-field-value">{data.employmentType.replace(/_/g, ' ')}</div></div>
                  <div className="cd-field"><div className="cd-field-label">Manager</div><div className="cd-field-value">{data.reportingManager?.displayName || '—'}</div></div>
                  <div className="cd-field"><div className="cd-field-label">Pay Grade</div><div className="cd-field-value">{data.payGrade ? `${data.payGrade.code} — ${data.payGrade.label}` : '—'}</div></div>
                  <div className="cd-field"><div className="cd-field-label">Location</div><div className="cd-field-value">{data.workLocation || '—'}</div></div>
                </div>
              </div>

              <div className="cd-section">
                <div className="cd-section-header">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
                  <div className="cd-section-title">Actions & Status</div>
                </div>
                {nextMoves.length > 0 && (
                  <div className="cd-action-group">
                    <div className="cd-action-label">Transition to</div>
                    <div className="cd-actions">
                      {nextMoves.map(to => (
                        <button key={to} className={`cd-btn${to === 'CANCELLED' ? ' danger' : ' primary'}`} disabled={busy} onClick={() => transition(to)}>
                          {to.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {data.status === 'JOINED' && (
                  <div className="cd-action-group">
                    <div className="cd-action-label">Conversion Gate</div>
                    <div className="cd-convert-gate">
                      <div className="cd-gate-item">
                        <div className={`cd-gate-icon ${data.offer?.status === 'accepted' ? 'pass' : 'fail'}`}>{data.offer?.status === 'accepted' ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> : '—'}</div>
                        <span>Offer accepted</span>
                      </div>
                      <div className="cd-gate-item">
                        <div className={`cd-gate-icon ${data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? 'pass' : 'fail'}`}>
                          {data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> : '—'}
                        </div>
                        <span>All mandatory docs verified</span>
                      </div>
                      <div className="cd-gate-item">
                        <div className={`cd-gate-icon ${data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? 'pass' : 'fail'}`}>
                          {data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> : '—'}
                        </div>
                        <span>All mandatory tasks complete</span>
                      </div>
                    </div>
                    <button className="cd-btn primary" disabled={!data.readyToConvert || busy} onClick={convert}>Convert to Employee</button>
                    {conversionResult?.setup && (
                      <div className="cd-convert-summary">
                        <div className="cd-convert-summary-title">Conversion Complete</div>
                        {conversionResult.setup.userCreated && <div className="cd-convert-check">✓ Employee account created</div>}
                        {conversionResult.setup.salaryStructure && <div className="cd-convert-check">✓ Salary structure set from offer</div>}
                        {conversionResult.setup.payGroup && <div className="cd-convert-check">✓ Added to pay group</div>}
                        {conversionResult.setup.leaveBalance && <div className="cd-convert-check">✓ Leave balance provisioned</div>}
                        {conversionResult.setup.declaration && <div className="cd-convert-check">✓ Tax declaration seeded ({String(conversionResult.setup.declaration)})</div>}
                        {conversionResult.setup.profileCopied && <div className="cd-convert-check">✓ Candidate profile copied</div>}
                        {conversionResult.setup.welcomeEmailSent && <div className="cd-convert-check">✓ Welcome email sent</div>}
                      </div>
                    )}
                  </div>
                )}

                {data.status === 'PROBATION' && (
                  <div className="cd-action-group">
                    <div className="cd-action-label">Probation Actions</div>
                    <div className="cd-actions">
                      <button className="cd-btn primary" disabled={busy} onClick={() => confirmAction('confirm')}>Confirm</button>
                      <button className="cd-btn" disabled={busy} onClick={() => confirmAction('extend')}>Extend</button>
                      <button className="cd-btn danger" disabled={busy} onClick={() => confirmAction('terminate')}>Terminate</button>
                    </div>
                  </div>
                )}

                {nextMoves.length === 0 && data.status !== 'JOINED' && data.status !== 'PROBATION' && (
                  <div className="cd-empty-actions">No actions available for this status.</div>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'Offer' && (
          <div className="cd-section cd-full">
            <div className="cd-section-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
              <div className="cd-section-title">Offer</div>
            </div>
            {data.offer ? (
              <>
                <div className="cd-offer-hero">
                  <div className="cd-offer-ctc">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.offer.ctcAnnual)}<span className="cd-offer-per"> / year</span></div>
                  <div className="cd-offer-meta">
                    <span className={`cd-offer-pill ${data.offer.status}`}>{data.offer.status}</span>
                    <span className="cd-offer-version">v{data.offer.version}</span>
                  </div>
                </div>
                {data.offer.componentsPreview.length > 0 && (
                  <table className="cd-comp-table">
                    <thead><tr><th>Component</th><th>Type</th><th>Calc</th><th>Value</th></tr></thead>
                    <tbody>
                      {data.offer.componentsPreview.map((c, i) => (
                        <tr key={i}><td>{c.label}</td><td>{c.type}</td><td>{c.calc.replace(/_/g, ' ')}</td><td>{c.value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data.offer.status === 'draft' && (
                  <div className="cd-actions"><button className="cd-btn primary" disabled={busy} onClick={sendOffer}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
                    Send Offer
                  </button></div>
                )}
                {portalLink && data.offer.status === 'sent' && (
                  <div className="cd-portal-link-box">
                    <div className="cd-portal-link-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      Portal link sent to candidate
                    </div>
                    <div className="cd-portal-link-row">
                      <input className="cd-portal-link-input" readOnly value={portalLink} onClick={e => (e.target as HTMLInputElement).select()} />
                      <button className="cd-btn primary" onClick={copyPortalLink}>{copied ? 'Copied!' : 'Copy'}</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="cd-offer-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                <p>No offer created yet.</p>
                <button className="cd-btn primary" onClick={createOffer}>Create Offer</button>
              </div>
            )}
          </div>
        )}

        {tab === 'Tasks' && (
          <div className="cd-section cd-full">
            <div className="cd-section-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
              <div className="cd-section-title">Tasks</div>
              <span className="cd-section-counter">{doneTaskCount}/{data.tasks.length} done</span>
            </div>
            {data.tasks.length === 0 ? (
              <div className="cd-empty-msg">No tasks. Assign a workflow template and transition to PRE_BOARDING.</div>
            ) : (
              <div className="cd-task-list">
                {data.tasks.map(t => (
                  <div key={t._id} className={`cd-task-row ${t.status === 'done' ? 'done' : ''}`}>
                    <input type="checkbox" className="cd-task-check" checked={t.status === 'done'} disabled={t.status === 'done' || t.blocked} onChange={() => completeTask(t._id)} />
                    <span className={`cd-task-title${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
                    {t.assignedTo && <span className="cd-task-assignee">{t.assignedTo.displayName}</span>}
                    {t.dueDate && <span className="cd-task-due">{new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                    <span className={`cd-task-badge ${t.blocked ? 'blocked' : t.status}`}>{t.blocked ? 'blocked' : t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'Documents' && (
          <div className="cd-section cd-full">
            <div className="cd-section-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              <div className="cd-section-title">Documents</div>
              <span className="cd-section-counter">{verifiedDocCount}/{data.documents.length} verified</span>
            </div>
            {data.documents.length === 0 ? (
              <div className="cd-empty-msg">No document requests. Transition to PRE_BOARDING to create them.</div>
            ) : (
              <div className="cd-doc-list">
                {data.documents.map(d => (
                  <div key={d._id} className="cd-doc-row">
                    <div className="cd-doc-left">
                      <div className={`cd-doc-icon ${d.verifyStatus}`}>
                        {d.verifyStatus === 'verified'
                          ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>}
                      </div>
                      <div>
                        <div className="cd-doc-type">{d.docType.replace(/_/g, ' ')}</div>
                        {d.submission?.filename && (
                          <a href={`${API}/onboarding/documents/${d.submission.fileId}/download`} target="_blank" rel="noreferrer" className="cd-doc-file">{d.submission.filename}</a>
                        )}
                        {d.rejectionReason && <div className="cd-doc-reject">Rejected: {d.rejectionReason}</div>}
                      </div>
                    </div>
                    <div className="cd-doc-right">
                      <span className={`cd-doc-status ${d.verifyStatus}`}>{d.verifyStatus}</span>
                      {d.verifyStatus === 'submitted' && (
                        <>
                          <button className="cd-btn primary small" onClick={() => verifyDoc(d._id)}>Verify</button>
                          <button className="cd-btn danger small" onClick={() => rejectDoc(d._id)}>Reject</button>
                        </>
                      )}
                      {(d.verifyStatus === 'awaiting' || d.verifyStatus === 'rejected') && (
                        <button className="cd-btn small" onClick={() => triggerUpload(d._id)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          Upload
                        </button>
                      )}
                    </div>
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
