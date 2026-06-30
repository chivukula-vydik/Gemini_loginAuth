import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed, authedRaw } from '../fetchHelper';
import './Declarations.css';

interface Proof { fileId: string; filename: string; contentType: string; size: number }
interface Item { section: string; declaredAmount: number; proofAmount: number | null; ownershipPercent: number; proofs: Proof[]; verifyStatus: string; rejectReason: string }
interface HraDetail { monthlyRent: number; isMetro: boolean; landlordPan: string }
interface Declaration {
  _id: string;
  regime: 'old' | 'new';
  items: Item[];
  hraDetail: HraDetail | null;
  hraExemption: number;
  phase: string;
  lockedForTds: boolean;
}

type Limits = Record<string, number>;

const ALL_SECTIONS = ['80C', '80D', '80E', '80G', 'HRA', '24B', '80CCD(1B)', '80TTA', '80DDB', '80U', '80EEB'];
const SECTION_LABELS: Record<string, string> = {
  '80C': '80C — PPF, ELSS, LIC, home loan principal, etc.',
  '80D': '80D — Medical insurance',
  '80E': '80E — Education loan interest (no limit)',
  '80G': '80G — Donations',
  'HRA': 'HRA — House Rent Allowance',
  '24B': '24B — Home loan interest (up to ₹2L)',
  '80CCD(1B)': '80CCD(1B) — NPS (additional)',
  '80TTA': '80TTA — Savings interest',
  '80DDB': '80DDB — Medical treatment',
  '80U': '80U — Disability',
  '80EEB': '80EEB — EV loan interest (up to ₹1.5L)',
};
const LOAN_SECTIONS = ['24B', '80E', '80EEB'];
const NEW_REGIME_BLOCKED = new Set(LOAN_SECTIONS);

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function currentFY() {
  const now = new Date();
  const y = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `FY${y}-${String(y + 1).slice(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'verified' ? 'dec-badge-ok' : status === 'rejected' ? 'dec-badge-err' : 'dec-badge-pending';
  return <span className={`dec-badge ${cls}`}>{status}</span>;
}

export function Declarations() {
  const navigate = useNavigate();
  const fy = currentFY();
  const [regime, setRegime] = useState<'old' | 'new'>('new');
  const [items, setItems] = useState<Item[]>([]);
  const [hraDetail, setHraDetail] = useState<HraDetail>({ monthlyRent: 0, isMetro: false, landlordPan: '' });
  const [hraExemption, setHraExemption] = useState(0);
  const [phase, setPhase] = useState('declaration');
  const [locked, setLocked] = useState(false);
  const [limits, setLimits] = useState<Limits>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadIdx, setUploadIdx] = useState(-1);

  useEffect(() => {
    Promise.all([
      authed(`/declarations/${fy}/me`),
      authed('/declarations/limits'),
    ]).then(([d, l]) => {
      if (d) {
        setRegime(d.regime);
        setItems(d.items || []);
        setHraDetail(d.hraDetail || { monthlyRent: 0, isMetro: false, landlordPan: '' });
        setHraExemption(d.hraExemption || 0);
        setPhase(d.phase);
        setLocked(d.lockedForTds);
      }
      setLimits(l || {});
      setLoaded(true);
    });
  }, []);

  function updateItem(idx: number, field: string, val: unknown) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }
  function addItem() { setItems(prev => [...prev, { section: '80C', declaredAmount: 0, proofAmount: null, ownershipPercent: 100, proofs: [], verifyStatus: 'pending', rejectReason: '' }]); }

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const d = await authed(`/declarations/${fy}`, 'POST', { regime, items, hraDetail: regime === 'old' ? hraDetail : null });
      setItems(d.items || []);
      setPhase(d.phase);
      setMsg('Saved');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    }
    setSaving(false);
  }

  async function submitProofs() {
    try {
      const d = await authed(`/declarations/${fy}/submit-proofs`, 'POST');
      setPhase(d.phase);
      setMsg('Proofs submitted for verification');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  function triggerUpload(idx: number) {
    setUploadIdx(idx);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploadIdx < 0) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await authedRaw(`/declarations/${fy}/proof/${uploadIdx}`, 'POST', fd);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'upload failed');
      setItems(d.items || []);
      setMsg('Proof uploaded');
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Upload failed');
    }
    e.target.value = '';
    setUploadIdx(-1);
  }

  if (!loaded) return <div className="dec-page">Loading...</div>;

  const isReadOnly = locked || phase === 'closed';
  const hasHra = regime === 'old' && items.some(it => it.section === 'HRA');
  const totalDeclared = items.reduce((s, it) => s + (it.declaredAmount || 0), 0);
  const availableSections = regime === 'new' ? ALL_SECTIONS.filter(s => !NEW_REGIME_BLOCKED.has(s)) : ALL_SECTIONS;

  return (
    <div className="dec-page">
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} accept=".pdf,.jpg,.jpeg,.png" />

      <h1 className="dec-title">Investment Declaration — {fy}</h1>

      <div className="dec-disclaimer">
        This data is collected solely for the purpose of computing your annual TDS and tax exemptions under the Income Tax Act. It will not be shared with third parties or used for employment evaluation. Only authorised Payroll/HR personnel can access uploaded documents.
        <br /><br />
        <strong>Eligible loan certificates:</strong> Home Loan (§24B interest / §80C principal), Education Loan (§80E), and EV Loan (§80EEB) only. Personal loans, car loans, and consumer EMIs do not qualify for tax deductions and must not be uploaded.
      </div>

      {phase !== 'declaration' && (
        <div className={`dec-phase-bar dec-phase-${phase}`}>
          Phase: <strong>{phase}</strong>{locked ? ' (locked for TDS)' : ''}
        </div>
      )}

      {/* Regime selection */}
      <div className="dec-card">
        <div className="dec-section-label">Tax Regime</div>
        <div className="dec-regime">
          <button className={`dec-regime-btn ${regime === 'new' ? 'active' : ''}`} disabled={isReadOnly} onClick={() => setRegime('new')}>New Regime</button>
          <button className={`dec-regime-btn ${regime === 'old' ? 'active' : ''}`} disabled={isReadOnly} onClick={() => setRegime('old')}>Old Regime</button>
        </div>
        <button className="dec-compare-btn" onClick={() => navigate('/declarations/compare')}>Compare & Choose Regime →</button>
        {regime === 'new' && <div className="dec-info">Under the New Tax Regime, most deductions don't apply. Loan interest deductions (Home Loan §24B, Education Loan §80E, EV Loan §80EEB) are disabled. Switch to Old Regime to claim these.</div>}
      </div>

      {/* Declarations */}
      <div className="dec-card">
        <div className="dec-section-label">Declarations <span className="dec-optional">(optional)</span></div>
        {items.length === 0 && <div className="dec-empty">No declarations yet. Adding declarations is voluntary — only add if you want to claim deductions under the Old Tax Regime.</div>}
        {items.map((item, i) => {
          const limit = limits[item.section];
          const overLimit = limit && limit !== Infinity && item.declaredAmount > limit;
          return (
            <div key={i} className={`dec-item-card ${item.verifyStatus === 'rejected' ? 'dec-item-rejected' : ''} ${regime === 'new' && NEW_REGIME_BLOCKED.has(item.section) ? 'dec-item-blocked' : ''}`}>
              {regime === 'new' && NEW_REGIME_BLOCKED.has(item.section) && (
                <div className="dec-warn">This loan section is not deductible under the New Tax Regime. Remove it or switch to Old Regime.</div>
              )}
              <div className="dec-item-row">
                <select className="dec-select" value={item.section} disabled={isReadOnly} onChange={e => updateItem(i, 'section', e.target.value)}>
                  {availableSections.map(s => <option key={s} value={s}>{SECTION_LABELS[s] || s}</option>)}
                  {!availableSections.includes(item.section) && <option value={item.section}>{SECTION_LABELS[item.section] || item.section} (blocked)</option>}
                </select>
                <div className="dec-amount-wrap">
                  <input className={`dec-input ${overLimit ? 'dec-input-err' : ''}`} type="number" value={item.declaredAmount} disabled={isReadOnly}
                    onChange={e => updateItem(i, 'declaredAmount', Number(e.target.value))} placeholder="Amount" />
                  {limit && limit !== Infinity && <span className="dec-limit">Max: {fmt(limit)}</span>}
                </div>
                {!isReadOnly && <button className="dec-remove" onClick={() => removeItem(i)}>×</button>}
              </div>
              {overLimit && <div className="dec-warn">Exceeds section limit of {fmt(limit!)}</div>}
              {item.rejectReason && <div className="dec-warn">Rejected: {item.rejectReason}</div>}

              {/* Co-borrower share for home loan sections */}
              {['24B', '80C'].includes(item.section) && (
                <div className="dec-coborrower">
                  <label className="dec-coborrower-label">
                    Your ownership share
                    <input className="dec-input dec-coborrower-input" type="number" min={1} max={100}
                      value={item.ownershipPercent ?? 100} disabled={isReadOnly}
                      onChange={e => updateItem(i, 'ownershipPercent', Math.min(100, Math.max(1, Number(e.target.value))))} />
                    <span>%</span>
                  </label>
                  {(item.ownershipPercent ?? 100) < 100 && (
                    <span className="dec-coborrower-note">Co-borrower detected — only your {item.ownershipPercent}% share will be considered</span>
                  )}
                </div>
              )}

              {/* Proof section */}
              <div className="dec-proof-row">
                <StatusBadge status={item.verifyStatus} />
                {item.proofs.length > 0 && (
                  <span className="dec-proof-count">{item.proofs.length} proof{item.proofs.length > 1 ? 's' : ''}</span>
                )}
                {item.proofAmount !== null && item.verifyStatus === 'verified' && (
                  <span className="dec-proof-amt">Verified: {fmt(item.proofAmount)}</span>
                )}
                {!isReadOnly && !(regime === 'new' && NEW_REGIME_BLOCKED.has(item.section)) && (
                  <button className="dec-upload-btn" onClick={() => triggerUpload(i)}>Upload proof</button>
                )}
              </div>
              {!isReadOnly && LOAN_SECTIONS.includes(item.section) && (
                <div className="dec-proof-hint">Upload official Provisional Interest Certificate from your bank/NBFC — raw bank statements will be rejected.</div>
              )}
              {item.proofs.length > 0 && (
                <div className="dec-proof-list">
                  {item.proofs.map((p, pi) => (
                    <span key={pi} className="dec-proof-file">{p.filename}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!isReadOnly && <button className="dec-add" onClick={addItem}>+ Add Declaration</button>}
      </div>

      {/* HRA detail (old regime only, if HRA section exists) */}
      {hasHra && (
        <div className="dec-card">
          <div className="dec-section-label">HRA Exemption Details</div>
          <div className="dec-hra-grid">
            <label>Monthly Rent
              <input className="dec-input" type="number" value={hraDetail.monthlyRent} disabled={isReadOnly}
                onChange={e => setHraDetail(p => ({ ...p, monthlyRent: Number(e.target.value) }))} />
            </label>
            <label>Landlord PAN {hraDetail.monthlyRent * 12 > 100000 ? '(required)' : ''}
              <input className="dec-input" type="text" value={hraDetail.landlordPan} disabled={isReadOnly}
                placeholder="AAAAA0000A" maxLength={10}
                onChange={e => setHraDetail(p => ({ ...p, landlordPan: e.target.value.toUpperCase() }))} />
            </label>
            <label className="dec-hra-metro">
              <input type="checkbox" checked={hraDetail.isMetro} disabled={isReadOnly}
                onChange={e => setHraDetail(p => ({ ...p, isMetro: e.target.checked }))} />
              Metro city (Delhi, Mumbai, Chennai, Kolkata)
            </label>
          </div>
          {hraExemption > 0 && (
            <div className="dec-hra-result">Computed HRA exemption: {fmt(hraExemption)} / year</div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="dec-card">
        <div className="dec-section-label">Summary</div>
        <div className="dec-summary-row"><span>Total Declared</span><span>{fmt(totalDeclared)}</span></div>
        {hasHra && hraExemption > 0 && <div className="dec-summary-row"><span>HRA Exemption</span><span>{fmt(hraExemption)}</span></div>}
        <div className="dec-summary-row dec-summary-total"><span>Total Deductions</span><span>{fmt(totalDeclared + (hasHra ? hraExemption : 0))}</span></div>
      </div>

      {msg && <div className="dec-msg">{msg}</div>}

      <div className="dec-actions">
        {!isReadOnly && (
          <button className="dec-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Declaration'}</button>
        )}
        {phase === 'declaration' && items.some(it => it.proofs.length > 0) && (
          <button className="dec-btn-secondary" onClick={submitProofs}>Submit Proofs for Verification</button>
        )}
      </div>
    </div>
  );
}
