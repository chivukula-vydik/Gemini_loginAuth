import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './CandidatePortal.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Checklist {
  status: string;
  candidate: { firstName: string; lastName: string; personalEmail: string };
  designation: string;
  joiningDate: string;
  offer: { ctcAnnual: number; status: string; joiningDate: string; expiryDate: string } | null;
  tasks: { key: string; title: string; status: string; dueDate: string }[];
  documents: { _id: string; docType: string; mandatory: boolean; verifyStatus: string; hasSubmission: boolean }[];
}

async function portalFetch(token: string, path: string, method = 'GET', body?: unknown) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}/onboarding/portal/${token}${path}`, opts);
  return r.json();
}

async function portalUpload(token: string, path: string, formData: FormData) {
  const r = await fetch(`${API}/onboarding/portal/${token}${path}`, { method: 'POST', body: formData });
  return r.json();
}

export function CandidatePortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Checklist | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocId, setUploadDocId] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    portalFetch(token, '/checklist').then(d => {
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(load, [token]);

  async function acceptOffer() {
    if (!token) return;
    setBusy(true);
    await portalFetch(token, '/accept-offer', 'POST');
    await load();
    setBusy(false);
  }

  async function declineOffer() {
    if (!token) return;
    const reason = prompt('Reason for declining (optional):') || '';
    setBusy(true);
    await portalFetch(token, '/decline-offer', 'POST', { reason });
    await load();
    setBusy(false);
  }

  async function completeTask(key: string) {
    if (!token) return;
    await portalFetch(token, `/tasks/${key}/complete`, 'POST');
    await load();
  }

  function triggerUpload(docId: string) {
    setUploadDocId(docId);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadDocId || !token) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docId', uploadDocId);
    await portalUpload(token, '/documents', fd);
    e.target.value = '';
    setUploadDocId(null);
    await load();
  }

  if (error) return <div className="cp-page"><div className="cp-error">{error}</div></div>;
  if (!data) return <div className="cp-page"><div className="cp-loading">Loading...</div></div>;

  const isTerminal = ['OFFER_DECLINED', 'CANCELLED'].includes(data.status);

  return (
    <div className="cp-page">
      <div className="cp-brand">Onboarding Portal</div>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} />

      <div className="cp-card">
        <div className="cp-welcome">Welcome, {data.candidate.firstName}!</div>
        <div className="cp-sub">{data.designation} — Joining {new Date(data.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        {isTerminal && <div style={{ color: '#dc2626', fontWeight: 600, fontSize: 14 }}>This case is {data.status.replace(/_/g, ' ').toLowerCase()}.</div>}
      </div>

      {data.offer && !isTerminal && (
        <div className="cp-card">
          <div className="cp-card-title">Offer</div>
          <div className="cp-offer-ctc">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.offer.ctcAnnual)} / year</div>
          <div className="cp-field"><div className="cp-field-label">Status</div><div className="cp-field-value" style={{ textTransform: 'uppercase' }}>{data.offer.status}</div></div>
          {data.offer.status === 'sent' && (
            <div className="cp-offer-actions" style={{ marginTop: 14 }}>
              <button className="pr-btn" disabled={busy} onClick={acceptOffer}>Accept Offer</button>
              <button className="cd-btn-sm danger" disabled={busy} onClick={declineOffer}>Decline</button>
            </div>
          )}
        </div>
      )}

      {!isTerminal && data.documents.length > 0 && (
        <div className="cp-card">
          <div className="cp-card-title">Documents</div>
          {data.documents.map(d => (
            <div key={d._id} className="cp-doc-row">
              <div>
                <span className="cp-doc-type">{d.docType.replace(/_/g, ' ')}</span>
                {d.mandatory && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 6 }}>Required</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`cp-doc-badge ${d.verifyStatus}`}>{d.verifyStatus}</span>
                {(d.verifyStatus === 'awaiting' || d.verifyStatus === 'rejected') && (
                  <button className="cd-btn-sm" onClick={() => triggerUpload(d._id)}>Upload</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isTerminal && data.tasks.length > 0 && (
        <div className="cp-card">
          <div className="cp-card-title">Tasks</div>
          <ul className="cp-checklist">
            {data.tasks.map(t => (
              <li key={t.key}>
                <div className={`cp-check ${t.status === 'done' ? 'done' : 'pending'}`}>{t.status === 'done' ? 'Y' : ' '}</div>
                <span style={{ flex: 1 }}>{t.title}</span>
                {t.status !== 'done' && <button className="cd-btn-sm" onClick={() => completeTask(t.key)}>Complete</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
