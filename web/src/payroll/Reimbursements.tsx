import { useState, useEffect, useRef } from 'react';
import { authed, authedRaw } from '../fetchHelper';
import { formatSize, formatINR } from '../format';
import './Reimbursements.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Attachment { fileId: string; filename: string; contentType: string; size: number; uploadedAt: string }
interface ApprovalStep { role: string; action: string; reason?: string; actedAt: string }
interface ProjectRef { _id: string; name: string }
interface UserRef { _id: string; displayName: string; email: string; employeeCode?: string }

interface Claim {
  _id: string;
  user: UserRef | string;
  category: string;
  amount: number;
  claimDate: string;
  description: string;
  status: string;
  project: ProjectRef | null;
  attachments: Attachment[];
  approvalTrail: ApprovalStep[];
  rejectionReason: string;
}

const CATEGORIES = ['travel', 'food', 'internet', 'medical', 'other'];
const STATUS_LABELS: Record<string, string> = {
  submitted: 'Pending RM', rm_approved: 'RM Approved', pm_approved: 'PM Approved',
  approved: 'Finance Approved', rejected: 'Rejected', paid: 'Paid',
};
const fmt = formatINR;

function userName(u: UserRef | string) {
  return typeof u === 'object' && u ? u.displayName : '—';
}

type Tab = 'my' | 'approvals';
type ApprovalQueue = 'rm' | 'pm' | 'finance';

export function Reimbursements() {
  const [tab, setTab] = useState<Tab>('my');

  // ── My claims state ──
  const [claims, setClaims] = useState<Claim[]>([]);
  const [category, setCategory] = useState('travel');
  const [amount, setAmount] = useState(0);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const formFileRef = useRef<HTMLInputElement>(null);
  const claimFileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  // ── Approval state ──
  const [queue, setQueue] = useState<ApprovalQueue>('rm');
  const [pendingClaims, setPendingClaims] = useState<Claim[]>([]);
  const [approvalLoaded, setApprovalLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── Expand state (shared) ──
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      authed('/reimbursements/me'),
      authed('/projects').catch(() => []),
    ]).then(([c, p]) => {
      setClaims(c);
      setProjects(Array.isArray(p) ? p : []);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (tab !== 'approvals') return;
    setApprovalLoaded(false);
    authed(`/reimbursements/pending/${queue}`)
      .then(d => { setPendingClaims(d); setApprovalLoaded(true); })
      .catch(() => { setPendingClaims([]); setApprovalLoaded(true); });
  }, [tab, queue]);

  // ── Submit claim ──
  async function submit() {
    setSubmitting(true);
    const claim = await authed('/reimbursements', 'POST', {
      category, amount, claimDate, description, project: projectId || undefined,
    });
    let attachments: Attachment[] = [];
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authedRaw(`/reimbursements/${claim._id}/attachments`, 'POST', fd);
      if (res.ok) attachments.push(await res.json());
    }
    setClaims(prev => [{ ...claim, attachments, approvalTrail: [], rejectionReason: '' }, ...prev]);
    setAmount(0); setDescription(''); setProjectId(''); setPendingFiles([]);
    setSubmitting(false);
  }

  function addPendingFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && pendingFiles.length < 5) setPendingFiles(prev => [...prev, file]);
    e.target.value = '';
  }
  function removePendingFile(idx: number) { setPendingFiles(prev => prev.filter((_, i) => i !== idx)); }

  async function uploadToExisting(claimId: string, file: File) {
    setUploading(claimId);
    const fd = new FormData(); fd.append('file', file);
    const res = await authedRaw(`/reimbursements/${claimId}/attachments`, 'POST', fd);
    if (res.ok) {
      const att = await res.json();
      setClaims(prev => prev.map(c => c._id === claimId ? { ...c, attachments: [...(c.attachments || []), att] } : c));
    }
    setUploading(null);
  }
  async function deleteFile(claimId: string, fileId: string) {
    await authed(`/reimbursements/${claimId}/attachments/${fileId}`, 'DELETE');
    setClaims(prev => prev.map(c => c._id === claimId ? { ...c, attachments: (c.attachments || []).filter(a => a.fileId !== fileId) } : c));
  }
  function triggerClaimUpload(claimId: string) {
    setUploadTarget(claimId);
    setTimeout(() => claimFileRef.current?.click(), 0);
  }
  function onClaimFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && uploadTarget) uploadToExisting(uploadTarget, file);
    e.target.value = ''; setUploadTarget(null);
  }

  // ── Approval actions ──
  async function approveClaim(id: string) {
    setBusy(true);
    try {
      await authed(`/reimbursements/${id}/approve`, 'POST');
      setPendingClaims(prev => prev.filter(c => c._id !== id));
    } catch (e) { alert(e instanceof Error ? e.message : 'Approve failed'); }
    setBusy(false);
  }
  async function rejectClaim(id: string) {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    setBusy(true);
    try {
      await authed(`/reimbursements/${id}/reject`, 'POST', { reason });
      setPendingClaims(prev => prev.filter(c => c._id !== id));
    } catch (e) { alert(e instanceof Error ? e.message : 'Reject failed'); }
    setBusy(false);
  }

  function toggle(id: string) { setExpanded(prev => prev === id ? null : id); }

  if (!loaded) return <div className="rb-page"><div className="rb-empty">Loading...</div></div>;

  // ── Expandable claim card ──
  function ClaimCard({ c, mode }: { c: Claim; mode: 'my' | 'approval' }) {
    const isOpen = expanded === c._id;
    const isSubmitted = c.status === 'submitted';
    return (
      <div className={`rb-card ${isOpen ? 'rb-card-open' : ''}`}>
        <div className="rb-card-header" onClick={() => toggle(c._id)}>
          <div className="rb-card-left">
            {mode === 'approval' && <div className="rb-card-name">{userName(c.user)}</div>}
            <div className="rb-card-top">
              <span className="rb-card-cat">{c.category}</span>
              {c.project && <span className="rb-card-project">{c.project.name}</span>}
              <span className="rb-card-date">{c.claimDate}</span>
            </div>
            {c.description && <div className="rb-card-desc">{c.description}</div>}
          </div>
          <div className="rb-card-right">
            <span className="rb-card-amount">{fmt(c.amount)}</span>
            <span className={`rb-item-status ${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span>
            <span className="rb-chevron">{isOpen ? '▾' : '▸'}</span>
          </div>
        </div>

        {isOpen && (
          <div className="rb-card-body">
            {/* Approval trail */}
            {(c.approvalTrail || []).length > 0 && (
              <div className="rb-trail-section">
                <div className="rb-trail-label">Approval Trail</div>
                <div className="rb-trail-steps">
                  {c.approvalTrail.map((step, i) => (
                    <div key={i} className={`rb-trail-chip rb-trail-${step.action}`}>
                      <span className="rb-trail-role">{step.role.toUpperCase()}</span>
                      <span>{step.action}</span>
                      {step.reason && <span className="rb-trail-reason">— {step.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {c.rejectionReason && <div className="rb-reject-reason">Rejected: {c.rejectionReason}</div>}

            {/* Attachments */}
            <div className="rb-detail-attachments">
              <div className="rb-trail-label">Attachments</div>
              {(c.attachments || []).length === 0 && <span className="rb-no-att">No files attached</span>}
              <div className="rb-att-list">
                {(c.attachments || []).map(a => (
                  <div key={a.fileId} className="rb-att">
                    <a className="rb-att-name" href={`${API}/reimbursements/attachments/${a.fileId}`} target="_blank" rel="noreferrer">{a.filename}</a>
                    <span className="rb-att-size">{formatSize(a.size)}</span>
                    {mode === 'my' && isSubmitted && (
                      <button className="rb-att-del" onClick={e => { e.stopPropagation(); deleteFile(c._id, a.fileId); }} title="Remove">&times;</button>
                    )}
                  </div>
                ))}
                {mode === 'my' && isSubmitted && (c.attachments || []).length < 5 && (
                  <button className="rb-att-add" onClick={e => { e.stopPropagation(); triggerClaimUpload(c._id); }} disabled={uploading === c._id}>
                    {uploading === c._id ? 'Uploading...' : '+ Attach'}
                  </button>
                )}
              </div>
            </div>

            {/* Approval actions */}
            {mode === 'approval' && (
              <div className="rb-approval-actions">
                <button className="rb-btn-approve" onClick={e => { e.stopPropagation(); approveClaim(c._id); }} disabled={busy}>Approve</button>
                <button className="rb-btn-reject" onClick={e => { e.stopPropagation(); rejectClaim(c._id); }} disabled={busy}>Reject</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rb-page">
      <h1 className="rb-title">Reimbursements</h1>
      <input ref={formFileRef} type="file" style={{ display: 'none' }} onChange={addPendingFile} />
      <input ref={claimFileRef} type="file" style={{ display: 'none' }} onChange={onClaimFileSelect} />

      {/* Tab bar */}
      <div className="rb-tabs">
        <button className={`rb-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>My Claims</button>
        <button className={`rb-tab ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>Approvals</button>
      </div>

      {/* ── My Claims tab ── */}
      {tab === 'my' && (
        <>
          <div className="rb-submit-card">
            <div className="rb-card-section-label">New Claim</div>
            <div className="rb-form-row">
              <div className="rb-form-group">
                <label className="rb-form-label">Category</label>
                <select className="se-select" value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div className="rb-form-group">
                <label className="rb-form-label">Amount</label>
                <input className="se-input" type="text" inputMode="numeric" value={amount || ''} onChange={e => setAmount(Number(e.target.value.replace(/[^0-9.]/g, '')))} placeholder="0" />
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
            <div className="rb-form-row">
              <div className="rb-form-group" style={{ flex: 1 }}>
                <label className="rb-form-label">Project</label>
                <select className="se-select" value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">None</option>
                  {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {pendingFiles.length > 0 && (
              <div className="rb-pending-files">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="rb-att">
                    <span className="rb-att-name" style={{ color: 'var(--text)' }}>{f.name}</span>
                    <span className="rb-att-size">{formatSize(f.size)}</span>
                    <button className="rb-att-del" onClick={() => removePendingFile(i)} title="Remove">&times;</button>
                  </div>
                ))}
              </div>
            )}

            <div className="rb-form-actions">
              {pendingFiles.length < 5 && (
                <button type="button" className="rb-attach-btn" onClick={() => formFileRef.current?.click()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  Attach file
                </button>
              )}
              <button className="pr-btn" onClick={submit} disabled={submitting || !amount}>
                {submitting ? 'Submitting...' : 'Submit Claim'}
              </button>
            </div>
          </div>

          <div className="rb-card-section-label">My Claims</div>
          {claims.length === 0 ? (
            <div className="rb-empty">No claims yet.</div>
          ) : (
            <div className="rb-list">
              {claims.map(c => <ClaimCard key={c._id} c={c} mode="my" />)}
            </div>
          )}
        </>
      )}

      {/* ── Approvals tab ── */}
      {tab === 'approvals' && (
        <>
          <div className="rb-queue-tabs">
            {(['rm', 'pm', 'finance'] as ApprovalQueue[]).map(q => (
              <button key={q} className={`rb-queue-tab ${queue === q ? 'active' : ''}`} onClick={() => setQueue(q)}>
                {q === 'rm' ? 'RM Queue' : q === 'pm' ? 'PM Queue' : 'Finance Queue'}
              </button>
            ))}
          </div>

          {!approvalLoaded ? (
            <div className="rb-empty">Loading...</div>
          ) : pendingClaims.length === 0 ? (
            <div className="rb-empty">No pending claims in this queue.</div>
          ) : (
            <div className="rb-list">
              {pendingClaims.map(c => <ClaimCard key={c._id} c={c} mode="approval" />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
