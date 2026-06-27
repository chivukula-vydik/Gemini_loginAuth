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
    await authed(`/onboarding/${id}/offer/send`, 'POST');
    await load();
    setBusy(false);
  }

  async function convert() {
    if (!confirm('This will create a real employee account. Proceed?')) return;
    setBusy(true);
    await authed(`/onboarding/${id}/convert`, 'POST');
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

  if (!data) return <div className="cd-page"><div className="ob-empty">Loading...</div></div>;

  const nextMoves = NEXT_TRANSITIONS[data.status] || [];

  return (
    <div className="cd-page">
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} />
      <a className="cd-back" onClick={() => navigate('/onboarding')}>Back to Board</a>
      <div className="cd-header">
        <div>
          <div className="cd-name">{data.candidate.firstName} {data.candidate.lastName}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{data.designation}{data.department ? ` — ${data.department.name}` : ''}</div>
        </div>
        <span className="cd-status">{data.status.replace(/_/g, ' ')}</span>
      </div>

      <div className="cd-tabs">
        {TABS.map(t => <button key={t} className={`cd-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="cd-section">
            <div className="cd-section-title">Candidate Info</div>
            <div className="cd-grid">
              <div className="cd-field"><div className="cd-field-label">Email</div><div className="cd-field-value">{data.candidate.personalEmail}</div></div>
              <div className="cd-field"><div className="cd-field-label">Phone</div><div className="cd-field-value">{data.candidate.phone || '—'}</div></div>
              <div className="cd-field"><div className="cd-field-label">Joining Date</div><div className="cd-field-value">{new Date(data.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
              <div className="cd-field"><div className="cd-field-label">Probation</div><div className="cd-field-value">{data.probationMonths} months</div></div>
              <div className="cd-field"><div className="cd-field-label">Employment</div><div className="cd-field-value">{data.employmentType.replace(/_/g, ' ')}</div></div>
              <div className="cd-field"><div className="cd-field-label">Manager</div><div className="cd-field-value">{data.reportingManager?.displayName || '—'}</div></div>
              <div className="cd-field"><div className="cd-field-label">Pay Grade</div><div className="cd-field-value">{data.payGrade ? `${data.payGrade.code} — ${data.payGrade.label}` : '—'}</div></div>
              <div className="cd-field"><div className="cd-field-label">Location</div><div className="cd-field-value">{data.workLocation || '—'}</div></div>
            </div>
          </div>

          {data.status === 'JOINED' && (
            <div className="cd-section">
              <div className="cd-section-title">Conversion Gate</div>
              <div className="cd-convert-gate">
                <div className="cd-gate-item">
                  <div className={`cd-gate-icon ${data.offer?.status === 'accepted' ? 'pass' : 'fail'}`}>{data.offer?.status === 'accepted' ? 'Y' : 'N'}</div>
                  Offer accepted
                </div>
                <div className="cd-gate-item">
                  <div className={`cd-gate-icon ${data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? 'pass' : 'fail'}`}>
                    {data.documents.filter(d => d.mandatory).every(d => d.verifyStatus === 'verified') ? 'Y' : 'N'}
                  </div>
                  All mandatory docs verified
                </div>
                <div className="cd-gate-item">
                  <div className={`cd-gate-icon ${data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? 'pass' : 'fail'}`}>
                    {data.tasks.filter(t => t.mandatory).every(t => t.status === 'done') ? 'Y' : 'N'}
                  </div>
                  All mandatory tasks complete
                </div>
              </div>
              <button className="cd-btn-sm primary" disabled={!data.readyToConvert || busy} onClick={convert}>Convert to Employee</button>
            </div>
          )}

          {data.status === 'PROBATION' && (
            <div className="cd-section">
              <div className="cd-section-title">Probation Actions</div>
              <div className="cd-actions">
                <button className="cd-btn-sm primary" disabled={busy} onClick={() => confirmAction('confirm')}>Confirm</button>
                <button className="cd-btn-sm" disabled={busy} onClick={() => confirmAction('extend')}>Extend</button>
                <button className="cd-btn-sm danger" disabled={busy} onClick={() => confirmAction('terminate')}>Terminate</button>
              </div>
            </div>
          )}

          <div className="cd-actions">
            {nextMoves.map(to => (
              <button key={to} className={`cd-btn-sm${to === 'CANCELLED' ? ' danger' : ''}`} disabled={busy} onClick={() => transition(to)}>
                {to.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'Offer' && (
        <div className="cd-section">
          <div className="cd-section-title">Offer</div>
          {data.offer ? (
            <>
              <div className="cd-grid" style={{ marginBottom: 16 }}>
                <div className="cd-field"><div className="cd-field-label">CTC (Annual)</div><div className="cd-field-value">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.offer.ctcAnnual)}</div></div>
                <div className="cd-field"><div className="cd-field-label">Status</div><div className="cd-field-value" style={{ textTransform: 'uppercase' }}>{data.offer.status}</div></div>
                <div className="cd-field"><div className="cd-field-label">Version</div><div className="cd-field-value">v{data.offer.version}</div></div>
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
                <div className="cd-actions"><button className="cd-btn-sm primary" disabled={busy} onClick={sendOffer}>Send Offer</button></div>
              )}
            </>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>No offer created yet.</p>
              <button className="cd-btn-sm primary" onClick={createOffer}>Create Offer</button>
            </div>
          )}
        </div>
      )}

      {tab === 'Tasks' && (
        <div className="cd-section">
          <div className="cd-section-title">Tasks ({data.tasks.filter(t => t.status === 'done').length}/{data.tasks.length} done)</div>
          {data.tasks.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No tasks. Assign a workflow template and transition to PRE_BOARDING.</div>
          ) : (
            data.tasks.map(t => (
              <div key={t._id} className="cd-task-row">
                <input type="checkbox" className="cd-task-check" checked={t.status === 'done'} disabled={t.status === 'done' || t.blocked} onChange={() => completeTask(t._id)} />
                <span className={`cd-task-title${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
                {t.assignedTo && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.assignedTo.displayName}</span>}
                {t.dueDate && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                <span className={`cd-task-badge ${t.blocked ? 'blocked' : t.status}`}>{t.blocked ? 'blocked' : t.status}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Documents' && (
        <div className="cd-section">
          <div className="cd-section-title">Documents</div>
          {data.documents.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No document requests. Transition to PRE_BOARDING to create them.</div>
          ) : (
            data.documents.map(d => (
              <div key={d._id} className="cd-doc-row">
                <div>
                  <div className="cd-doc-type">{d.docType.replace(/_/g, ' ')}</div>
                  {d.submission?.filename && (
                    <a href={`${API}/onboarding/documents/${d.submission.fileId}/download`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>{d.submission.filename}</a>
                  )}
                  {d.rejectionReason && <div style={{ fontSize: 11, color: '#dc2626' }}>Rejected: {d.rejectionReason}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`cd-doc-status ${d.verifyStatus}`}>{d.verifyStatus}</span>
                  {d.verifyStatus === 'submitted' && (
                    <>
                      <button className="cd-btn-sm primary" onClick={() => verifyDoc(d._id)}>Verify</button>
                      <button className="cd-btn-sm danger" onClick={() => rejectDoc(d._id)}>Reject</button>
                    </>
                  )}
                  {(d.verifyStatus === 'awaiting' || d.verifyStatus === 'rejected') && (
                    <button className="cd-btn-sm" onClick={() => triggerUpload(d._id)}>Upload</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
