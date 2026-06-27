// web/src/payroll/Reimbursements.tsx
import { useState, useEffect, useRef } from 'react';
import { authed, authedRaw } from '../fetchHelper';
import './Reimbursements.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Attachment {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

interface Claim {
  _id: string;
  category: string;
  amount: number;
  claimDate: string;
  description: string;
  status: string;
  attachments: Attachment[];
}

const CATEGORIES = ['travel', 'food', 'internet', 'medical', 'other'];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Reimbursements() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [category, setCategory] = useState('travel');
  const [amount, setAmount] = useState(0);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const formFileRef = useRef<HTMLInputElement>(null);
  const claimFileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  useEffect(() => {
    authed('/reimbursements/me').then(d => { setClaims(d); setLoaded(true); });
  }, []);

  async function submit() {
    setSubmitting(true);
    const claim = await authed('/reimbursements', 'POST', { category, amount, claimDate, description });
    let attachments: Attachment[] = [];

    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authedRaw(`/reimbursements/${claim._id}/attachments`, 'POST', fd);
      if (res.ok) {
        const att = await res.json();
        attachments.push(att);
      }
    }

    setClaims(prev => [{ ...claim, attachments }, ...prev]);
    setAmount(0);
    setDescription('');
    setPendingFiles([]);
    setSubmitting(false);
  }

  function addPendingFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && pendingFiles.length < 5) {
      setPendingFiles(prev => [...prev, file]);
    }
    e.target.value = '';
  }

  function removePendingFile(idx: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function uploadToExisting(claimId: string, file: File) {
    setUploading(claimId);
    const fd = new FormData();
    fd.append('file', file);
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
    e.target.value = '';
    setUploadTarget(null);
  }

  if (!loaded) return <div className="rb-page"><div className="rb-empty">Loading...</div></div>;

  return (
    <div className="rb-page">
      <h1 className="rb-title">Reimbursements</h1>
      <input ref={formFileRef} type="file" style={{ display: 'none' }} onChange={addPendingFile} />
      <input ref={claimFileRef} type="file" style={{ display: 'none' }} onChange={onClaimFileSelect} />

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

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>My Claims</div>
      {claims.length === 0 ? (
        <div className="rb-empty">No claims yet.</div>
      ) : (
        <div className="rb-list">
          {claims.map(c => (
            <div key={c._id} className="rb-claim-card">
              <div className="rb-item">
                <div className="rb-item-info">
                  <span className="rb-item-cat">{c.category}</span>
                  <span className="rb-item-desc">{c.description || c.claimDate}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="rb-item-amount">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.amount)}</span>
                  <span className={`rb-item-status ${c.status}`}>{c.status}</span>
                </div>
              </div>
              {((c.attachments || []).length > 0 || c.status === 'submitted') && (
                <div className="rb-attachments">
                  {(c.attachments || []).map(a => (
                    <div key={a.fileId} className="rb-att">
                      <a className="rb-att-name" href={`${API}/reimbursements/attachments/${a.fileId}`} target="_blank" rel="noreferrer">{a.filename}</a>
                      <span className="rb-att-size">{formatSize(a.size)}</span>
                      {c.status === 'submitted' && (
                        <button className="rb-att-del" onClick={() => deleteFile(c._id, a.fileId)} title="Remove">&times;</button>
                      )}
                    </div>
                  ))}
                  {c.status === 'submitted' && (c.attachments || []).length < 5 && (
                    <button className="rb-att-add" onClick={() => triggerClaimUpload(c._id)} disabled={uploading === c._id}>
                      {uploading === c._id ? 'Uploading...' : '+ Attach'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
