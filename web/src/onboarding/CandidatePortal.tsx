import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './CandidatePortal.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

interface BreakdownLine { key: string; label: string; amount: number; isEstimate?: boolean }
interface Breakdown {
  ctcAnnual: number;
  grossMonthly: number;
  grossAnnual: number;
  monthlyEarnings: BreakdownLine[];
  employerContributions: BreakdownLine[];
  estimatedDeductions: BreakdownLine[];
  estimatedInHandMonthly: number;
  estimatedInHandAnnual: number;
  disclaimer: string;
}

interface Checklist {
  status: string;
  candidate: { firstName: string; lastName: string; personalEmail: string };
  designation: string;
  joiningDate: string;
  offer: { ctcAnnual: number; status: string; joiningDate: string; expiryDate: string } | null;
  breakdown: Breakdown | null;
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

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function BriefcaseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>;
}

function CalendarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}

function DocIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>;
}

function UploadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
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

  if (error) return (
    <div className="cp-page">
      <div className="cp-error-card">
        <div className="cp-error-icon">!</div>
        <div className="cp-error-title">Link expired or invalid</div>
        <div className="cp-error-sub">{error}</div>
      </div>
    </div>
  );

  if (!data) return (
    <div className="cp-page">
      <div className="cp-loader">
        <div className="cp-spinner" />
        <span>Loading your portal...</span>
      </div>
    </div>
  );

  const isTerminal = ['OFFER_DECLINED', 'CANCELLED'].includes(data.status);
  const joinDate = new Date(data.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const doneTaskCount = data.tasks.filter(t => t.status === 'done').length;
  const verifiedDocCount = data.documents.filter(d => d.verifyStatus === 'verified').length;

  return (
    <div className="cp-page">
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} />

      {/* Hero banner */}
      <div className="cp-hero">
        <div className="cp-hero-bg" />
        <div className="cp-hero-content">
          <div className="cp-hero-avatar">{data.candidate.firstName[0]}{data.candidate.lastName[0]}</div>
          <h1 className="cp-hero-title">Welcome, {data.candidate.firstName}!</h1>
          <p className="cp-hero-sub">
            <BriefcaseIcon /> {data.designation}
            <span className="cp-hero-dot" />
            <CalendarIcon /> Joining {joinDate}
          </p>
          {isTerminal && (
            <div className="cp-hero-terminal">This case is {data.status.replace(/_/g, ' ').toLowerCase()}.</div>
          )}
        </div>
      </div>

      <div className="cp-body">
        {/* Progress overview */}
        {!isTerminal && (data.tasks.length > 0 || data.documents.length > 0) && (
          <div className="cp-progress-strip">
            {data.offer && (
              <div className="cp-progress-item">
                <div className={`cp-progress-circle ${data.offer.status === 'accepted' ? 'done' : data.offer.status === 'sent' ? 'active' : ''}`}>
                  {data.offer.status === 'accepted' ? <CheckIcon /> : '1'}
                </div>
                <span>Offer</span>
              </div>
            )}
            {data.documents.length > 0 && (
              <div className="cp-progress-item">
                <div className={`cp-progress-circle ${verifiedDocCount === data.documents.length ? 'done' : verifiedDocCount > 0 ? 'active' : ''}`}>
                  {verifiedDocCount === data.documents.length ? <CheckIcon /> : '2'}
                </div>
                <span>Documents</span>
              </div>
            )}
            {data.tasks.length > 0 && (
              <div className="cp-progress-item">
                <div className={`cp-progress-circle ${doneTaskCount === data.tasks.length ? 'done' : doneTaskCount > 0 ? 'active' : ''}`}>
                  {doneTaskCount === data.tasks.length ? <CheckIcon /> : '3'}
                </div>
                <span>Tasks</span>
              </div>
            )}
          </div>
        )}

        {/* Offer card */}
        {data.offer && !isTerminal && (
          <div className="cp-card cp-offer-card">
            <div className="cp-card-header">
              <div className="cp-card-icon offer"><BriefcaseIcon /></div>
              <div className="cp-card-title">Your Offer</div>
              <span className={`cp-status-pill ${data.offer.status}`}>{data.offer.status}</span>
            </div>
            <div className="cp-offer-amount">{fmt(data.offer.ctcAnnual)}<span className="cp-offer-per"> / year</span></div>

            {data.breakdown ? (
              <div className="cp-breakdown">
                <div className="cp-breakdown-section">
                  <div className="cp-breakdown-heading">Monthly Earnings</div>
                  {data.breakdown.monthlyEarnings.map(e => (
                    <div key={e.key} className="cp-breakdown-row">
                      <span>{e.label}</span><span>{fmt(e.amount)}</span>
                    </div>
                  ))}
                  <div className="cp-breakdown-row cp-breakdown-subtotal">
                    <span>Gross Monthly</span><span>{fmt(data.breakdown.grossMonthly)}</span>
                  </div>
                </div>

                {data.breakdown.employerContributions.length > 0 && (
                  <div className="cp-breakdown-section">
                    <div className="cp-breakdown-heading">Employer Contributions <span className="cp-breakdown-hint">(not paid in hand)</span></div>
                    {data.breakdown.employerContributions.map(e => (
                      <div key={e.key} className="cp-breakdown-row">
                        <span>{e.label}</span><span>{fmt(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="cp-breakdown-section">
                  <div className="cp-breakdown-heading">Estimated Monthly Deductions</div>
                  {data.breakdown.estimatedDeductions.map(d => (
                    <div key={d.key} className="cp-breakdown-row">
                      <span>{d.label}{d.isEstimate ? ' *' : ''}</span><span>{fmt(d.amount)}</span>
                    </div>
                  ))}
                </div>

                <div className="cp-breakdown-inhand">
                  <span>Estimated Monthly In-Hand</span>
                  <span>{fmt(data.breakdown.estimatedInHandMonthly)}</span>
                </div>
                <div className="cp-breakdown-inhand-annual">
                  Estimated Annual In-Hand: {fmt(data.breakdown.estimatedInHandAnnual)}
                </div>
                <div className="cp-breakdown-disclaimer">{data.breakdown.disclaimer}</div>
              </div>
            ) : null}

            {data.offer.status === 'sent' && (
              <div className="cp-offer-actions">
                <button className="cp-btn cp-btn-accept" disabled={busy} onClick={acceptOffer}>
                  <CheckIcon /> Accept Offer
                </button>
                <button className="cp-btn cp-btn-decline" disabled={busy} onClick={declineOffer}>Decline</button>
              </div>
            )}
            {data.offer.status === 'accepted' && (
              <div className="cp-offer-accepted">
                <CheckIcon /> You have accepted this offer
              </div>
            )}
          </div>
        )}

        {/* Documents card */}
        {!isTerminal && data.documents.length > 0 && (
          <div className="cp-card">
            <div className="cp-card-header">
              <div className="cp-card-icon doc"><DocIcon /></div>
              <div className="cp-card-title">Documents</div>
              <span className="cp-counter">{verifiedDocCount}/{data.documents.length}</span>
            </div>
            <div className="cp-doc-list">
              {data.documents.map(d => (
                <div key={d._id} className={`cp-doc-row ${d.verifyStatus}`}>
                  <div className="cp-doc-left">
                    <div className={`cp-doc-icon ${d.verifyStatus}`}>
                      {d.verifyStatus === 'verified' ? <CheckIcon /> : <DocIcon />}
                    </div>
                    <div>
                      <div className="cp-doc-name">{d.docType.replace(/_/g, ' ')}</div>
                      {d.mandatory && <span className="cp-doc-req">Required</span>}
                    </div>
                  </div>
                  <div className="cp-doc-right">
                    <span className={`cp-doc-badge ${d.verifyStatus}`}>{d.verifyStatus}</span>
                    {(d.verifyStatus === 'awaiting' || d.verifyStatus === 'rejected') && (
                      <button className="cp-btn cp-btn-upload" onClick={() => triggerUpload(d._id)}>
                        <UploadIcon /> Upload
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tasks card */}
        {!isTerminal && data.tasks.length > 0 && (
          <div className="cp-card">
            <div className="cp-card-header">
              <div className="cp-card-icon task"><CheckIcon /></div>
              <div className="cp-card-title">Tasks</div>
              <span className="cp-counter">{doneTaskCount}/{data.tasks.length}</span>
            </div>
            <div className="cp-task-list">
              {data.tasks.map(t => (
                <div key={t.key} className={`cp-task-row ${t.status}`}>
                  <div className={`cp-task-check ${t.status}`}>
                    {t.status === 'done' && <CheckIcon />}
                  </div>
                  <span className={`cp-task-title ${t.status}`}>{t.title}</span>
                  {t.status !== 'done' && (
                    <button className="cp-btn cp-btn-complete" onClick={() => completeTask(t.key)}>Mark done</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="cp-footer">
          Questions? Reach out to your HR contact for assistance.
        </div>
      </div>
    </div>
  );
}
