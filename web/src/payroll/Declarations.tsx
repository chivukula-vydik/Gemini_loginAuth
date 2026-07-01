import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed, authedRaw } from '../fetchHelper';
import './Declarations.css';

// ── types ────────────────────────────────────────────────────────────────
interface Proof { fileId: string; filename: string; contentType: string; size: number }
interface Item { section: string; declaredAmount: number; proofAmount: number | null; ownershipPercent: number; proofs: Proof[]; verifyStatus: string; rejectReason: string }
interface HraDetail { monthlyRent: number; isMetro: boolean; landlordPan: string }
type Limits = Record<string, number>;

// ── constants ────────────────────────────────────────────────────────────
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

const SECTION_LIMITS: Record<string, number> = {
  '80C': 150000, '80D': 100000, '24B': 200000, '80CCD(1B)': 50000,
  '80TTA': 10000, '80DDB': 100000, '80U': 125000, '80EEB': 150000,
};

const REQUIRED_DOCS: Record<string, string[]> = {
  '80C':       ['PPF passbook / statement', 'ELSS mutual fund statement', 'LIC premium receipt', 'EPF passbook', 'NSC certificate', 'Tuition fee receipt'],
  '80D':       ['Health insurance premium receipt', 'Preventive health check-up bill'],
  '80E':       ['Education loan interest certificate from bank'],
  '80G':       ['80G donation receipt with PAN of donee'],
  'HRA':       ['Rent agreement', 'Rent receipts (monthly)', 'Landlord PAN card copy'],
  '24B':       ['Home loan provisional interest certificate from bank/NBFC'],
  '80CCD(1B)': ['NPS Tier-1 contribution receipt / statement'],
  '80TTA':     ['Savings account interest certificate from bank'],
  '80DDB':     ['Medical certificate (Form 10-I)', 'Hospital bills / prescription'],
  '80U':       ['Disability certificate (Form 10-IA) from medical authority'],
  '80EEB':     ['EV loan interest certificate from bank/NBFC'],
};

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const fmtShort = (n: number) => n ? new Intl.NumberFormat('en-IN').format(n) : '';

function currentFY() {
  const now = new Date();
  const y = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `FY${y}-${String(y + 1).slice(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'verified' ? 'dec-badge-ok' : status === 'rejected' ? 'dec-badge-err' : 'dec-badge-pending';
  return <span className={`dec-badge ${cls}`}>{status}</span>;
}

// ── Multi-step form field definitions ────────────────────────────────────
interface FieldDef { key: string; label: string; tooltip: string; limit?: number; oldOnly?: boolean }

const STEPS = ['Basic Details', 'Income Details', 'Deductions'] as const;
type Step = 0 | 1 | 2;

const INCOME_FIELDS: FieldDef[] = [
  { key: 'salary',             label: 'Income from Salary',                tooltip: 'Your gross annual salary as per Form 16 / CTC breakdown.' },
  { key: 'interest',           label: 'Income from Interest',              tooltip: 'Interest earned from savings accounts, FDs, RDs, and bonds.' },
  { key: 'rental',             label: 'Rental Income Received',            tooltip: 'Gross annual rent received from let-out property.' },
  { key: 'digital-assets',     label: 'Income from Digital Assets',        tooltip: 'Income from transfer of virtual digital assets (crypto, NFTs). Taxed at flat 30%.' },
  { key: 'exempt-allowances',  label: 'Exempt Allowances',                 tooltip: 'HRA, LTA, food allowance and other exempt components.', oldOnly: true },
  { key: 'hl-self',            label: 'Interest on Home Loan (Self Occupied)', tooltip: 'Interest paid on home loan for self-occupied property. Up to ₹2,00,000 under Section 24(b).', limit: 200000, oldOnly: true },
  { key: 'hl-letout',          label: 'Interest on Home Loan (Let Out)',   tooltip: 'Interest paid on home loan for rented/let-out property. No upper limit.', oldOnly: true },
  { key: 'other',              label: 'Other Income',                      tooltip: 'Any other taxable income — freelancing, capital gains, lottery, etc.' },
];

const DEDUCTION_FIELDS: FieldDef[] = [
  { key: '80C',       label: 'Basic Deductions (80C)',            tooltip: 'PPF, ELSS, LIC premium, EPF, NSC, SSY, home loan principal, tuition fees.', limit: 150000, oldOnly: true },
  { key: '80D',       label: 'Medical Insurance (80D)',           tooltip: 'Health insurance premium — up to ₹25,000 self/family, ₹25,000 parents.', limit: 100000, oldOnly: true },
  { key: '80EEB',     label: 'Interest on EV Loan (80EEB)',       tooltip: 'Interest on loan for purchase of electric vehicle. Up to ₹1,50,000.', limit: 150000, oldOnly: true },
  { key: '80TTA',     label: 'Interest from Deposits (80TTA)',    tooltip: 'Interest earned on savings account. Maximum ₹10,000.', limit: 10000, oldOnly: true },
  { key: '80G',       label: 'Donations to Charity (80G)',        tooltip: 'Donations to approved funds, trusts and institutions.', oldOnly: true },
  { key: '80CCD(1B)', label: "Employee's NPS Contribution (80CCD)", tooltip: 'Additional NPS contribution — over and above 80C. Maximum ₹50,000.', limit: 50000, oldOnly: true },
  { key: 'NPS_EMPLOYER', label: "Employer's NPS Contribution (80CCD(2))", tooltip: "Employer's contribution to NPS — up to 10% of basic + DA." },
  { key: '80DDB',     label: 'Medical Treatment (80DDB)',         tooltip: 'Expenses on treatment of specified diseases for self or dependant.', limit: 100000, oldOnly: true },
  { key: '80U',       label: 'Disability Deduction (80U)',        tooltip: 'Deduction for person with disability — ₹75,000 or ₹1,25,000.', limit: 125000, oldOnly: true },
  { key: '80E',       label: 'Education Loan Interest (80E)',     tooltip: 'Interest on loan for higher education. No upper limit — 8 years.', oldOnly: true },
];

// ── Tooltip ──────────────────────────────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="dec-tip-wrap" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg className="dec-tip-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
      {show && <span className="dec-tip-bubble">{text}</span>}
    </span>
  );
}

// ── RupeeInput ───────────────────────────────────────────────────────────
function RupeeInput({ value, onChange, disabled, limit }: {
  value: number; onChange: (v: number) => void; disabled?: boolean; limit?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');
  const display = focused ? raw : (value ? fmtShort(value) : '');
  return (
    <div className={`dec-rupee-wrap ${focused ? 'focused' : ''} ${disabled ? 'disabled' : ''}`}>
      <span className="dec-rupee-symbol">₹</span>
      <input className="dec-rupee-input" type={focused ? 'number' : 'text'} value={display}
        placeholder="0" disabled={disabled}
        onFocus={() => { setFocused(true); setRaw(value ? String(value) : ''); }}
        onBlur={() => setFocused(false)}
        onChange={e => { const v = e.target.value; setRaw(v); let n = Math.max(0, Number(v) || 0); if (limit && limit !== Infinity) n = Math.min(n, limit); onChange(n); }} />
      {limit && limit !== Infinity && <span className="dec-rupee-limit">max {fmt(limit)}</span>}
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────
function Stepper({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  return (
    <div className="dec-stepper">
      {STEPS.map((label, i) => (
        <button key={label} className={`dec-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} onClick={() => onStep(i as Step)}>
          <span className="dec-step-num">{i < step ? '✓' : i + 1}</span>
          <span className="dec-step-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export function Declarations() {
  const navigate = useNavigate();
  const fy = currentFY();

  // view mode: 'overview' = original doc-upload page, 'edit' = multi-step form
  const [view, setView] = useState<'overview' | 'edit'>('overview');
  const [step, setStep] = useState<Step>(0);

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

  // multi-step form amounts (income + deduction fields)
  const [amounts, setAmounts] = useState<Record<string, number>>({});

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
        const init: Record<string, number> = {};
        for (const it of d.items || []) {
          init[it.section] = (init[it.section] || 0) + (it.declaredAmount || 0);
        }
        setAmounts(init);
      }
      setLimits(l || {});
      setLoaded(true);
    });
  }, []);

  const setAmount = useCallback((key: string, val: number) => {
    setAmounts(prev => ({ ...prev, [key]: val }));
  }, []);

  const isReadOnly = locked || phase === 'closed';
  const isOld = regime === 'old';

  // ── Overview mode functions ────────────────────────────────────────────
  function updateItem(idx: number, field: string, val: unknown) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }
  function addItem() { setItems(prev => [...prev, { section: '80C', declaredAmount: 0, proofAmount: null, ownershipPercent: 100, proofs: [], verifyStatus: 'pending', rejectReason: '' }]); }

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const d = await authed(`/declarations/${fy}`, 'POST', { regime, items, hraDetail: isOld ? hraDetail : null });
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

  const hasHra = isOld && items.some(it => it.section === 'HRA');
  const totalDeclared = items.reduce((s, it) => s + (it.declaredAmount || 0), 0);
  const availableSections = regime === 'new' ? ALL_SECTIONS.filter(s => !NEW_REGIME_BLOCKED.has(s)) : ALL_SECTIONS;

  // ══════════════════════════════════════════════════════════════════════
  // REGIME CALCULATOR (play with numbers, no saving)
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'edit') {
    const deductionKeys = DEDUCTION_FIELDS.map(f => f.key);
    const totalDeductions = deductionKeys.reduce((s, k) => s + (amounts[k] || 0), 0);
    const incomeKeys = INCOME_FIELDS.map(f => f.key);
    const totalIncome = incomeKeys.reduce((s, k) => s + (amounts[k] || 0), 0);

    return (
      <div className="dec-page">
        <div className="dec-header">
          <button className="dec-back-link" onClick={() => setView('overview')}>← Back to Declarations</button>
          <h1 className="dec-title">Compare Tax Regimes — {fy}</h1>
          <p className="dec-subtitle">Enter your income and deductions to see which regime saves you more tax. Nothing is saved here — this is just a calculator.</p>
        </div>

        <Stepper step={step} onStep={setStep} />

        {/* Step 0: Choose Regime */}
        {step === 0 && (
          <div className="dec-step-content">
            <div className="dec-card">
              <div className="dec-card-title">Pick a Regime to Explore</div>
              <p className="dec-card-desc">Try both — switch anytime. The comparison at the end shows tax under both regimes.</p>
              <div className="dec-regime-cards">
                <label className={`dec-regime-opt ${regime === 'new' ? 'active' : ''}`}>
                  <input type="radio" name="regime" checked={regime === 'new'} onChange={() => setRegime('new')} />
                  <div><strong>New Regime</strong><span>Lower tax rates, minimal deductions</span></div>
                </label>
                <label className={`dec-regime-opt ${regime === 'old' ? 'active' : ''}`}>
                  <input type="radio" name="regime" checked={regime === 'old'} onChange={() => setRegime('old')} />
                  <div><strong>Old Regime</strong><span>Higher rates, but claim 80C/80D/HRA etc.</span></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Income Details */}
        {step === 1 && (
          <div className="dec-step-content">
            <div className="dec-card">
              <div className="dec-card-title">Income Details</div>
              <p className="dec-card-desc">Enter your estimated income from all sources. Try different numbers to see the impact.</p>
              <div className="dec-form-grid">
                {INCOME_FIELDS.map(f => {
                  const disabled = !isOld && f.oldOnly;
                  return (
                    <div key={f.key} className={`dec-field ${disabled && f.oldOnly ? 'dec-field-disabled' : ''}`}>
                      <label className="dec-field-label">
                        {f.label}
                        {f.oldOnly && <span className="dec-old-tag">Old Regime</span>}
                        <InfoTip text={f.tooltip} />
                      </label>
                      <RupeeInput value={amounts[f.key] || 0} onChange={v => setAmount(f.key, v)} disabled={disabled} limit={f.limit} />
                    </div>
                  );
                })}
              </div>
              {totalIncome > 0 && <div className="dec-section-total">Total Income: {fmt(totalIncome)}</div>}
            </div>
          </div>
        )}

        {/* Step 2: Deductions */}
        {step === 2 && (
          <div className="dec-step-content">
            <div className="dec-card">
              <div className="dec-card-title">Deductions</div>
              <p className="dec-card-desc">
                {isOld ? 'Enter planned investments to see how they reduce your tax.' : 'Most deductions don\'t apply under new regime. Switch to old regime to try them.'}
              </p>
              <div className="dec-form-grid">
                {DEDUCTION_FIELDS.map(f => {
                  const disabled = !isOld && f.oldOnly;
                  return (
                    <div key={f.key} className={`dec-field ${disabled && f.oldOnly ? 'dec-field-disabled' : ''}`}>
                      <label className="dec-field-label">
                        {f.label}
                        {f.oldOnly && !isOld && <span className="dec-old-tag">Old Regime Only</span>}
                        <InfoTip text={f.tooltip} />
                      </label>
                      <RupeeInput value={amounts[f.key] || 0} onChange={v => setAmount(f.key, v)} disabled={disabled} limit={f.limit} />
                    </div>
                  );
                })}
              </div>
              {totalDeductions > 0 && <div className="dec-section-total">Total Deductions: {fmt(totalDeductions)}</div>}
            </div>
          </div>
        )}

        {/* Summary bar */}
        <div className="dec-summary-bar">
          <div className="dec-summary-item"><span className="dec-summary-label">Regime</span><span className="dec-summary-value">{isOld ? 'Old' : 'New'}</span></div>
          <div className="dec-summary-item"><span className="dec-summary-label">Income</span><span className="dec-summary-value">{fmt(totalIncome)}</span></div>
          <div className="dec-summary-item"><span className="dec-summary-label">Deductions</span><span className="dec-summary-value">{fmt(totalDeductions)}</span></div>
        </div>

        {/* Navigation */}
        <div className="dec-nav">
          <div className="dec-nav-left">
            {step > 0 && <button className="dec-nav-btn dec-nav-back" onClick={() => setStep((step - 1) as Step)}>← Back</button>}
          </div>
          <div className="dec-nav-right">
            {step < 2 && <button className="dec-nav-btn dec-nav-continue" onClick={() => setStep((step + 1) as Step)}>Continue →</button>}
            {step === 2 && (
              <button className="dec-nav-btn dec-nav-continue" onClick={() => navigate('/declarations/compare')}>View Calculation →</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // OVERVIEW MODE (original doc-upload page)
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="dec-page">
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileSelect} accept=".pdf" />

      <h1 className="dec-title">Investment Declaration — {fy}</h1>

      <div className="dec-disclaimer">
        This data is collected solely for computing your annual TDS and tax exemptions under the Income Tax Act. Only authorised Payroll/HR personnel can access uploaded documents.
        <br /><br />
        <strong>Eligible loan certificates:</strong> Home Loan (§24B interest / §80C principal), Education Loan (§80E), and EV Loan (§80EEB) only. Personal loans, car loans, and consumer EMIs do not qualify.
      </div>

      {phase !== 'declaration' && (
        <div className={`dec-phase-bar dec-phase-${phase}`}>
          Phase: <strong>{phase}</strong>{locked ? ' (locked for TDS)' : ''}
        </div>
      )}

      {/* Regime selection */}
      <div className="dec-card">
        <div className="dec-section-label">Tax Regime</div>
        <div className="dec-regime-row">
          <div className="dec-regime">
            <button className={`dec-regime-btn ${regime === 'new' ? 'active' : ''}`} disabled={isReadOnly} onClick={() => setRegime('new')}>New Regime</button>
            <button className={`dec-regime-btn ${regime === 'old' ? 'active' : ''}`} disabled={isReadOnly} onClick={() => setRegime('old')}>Old Regime</button>
          </div>
          <button className="dec-compare-btn" onClick={() => { setStep(0); setView('edit'); }}>Compare Regimes →</button>
        </div>
        {regime === 'new' && <div className="dec-info">Under the New Tax Regime, most deductions don't apply. Loan interest deductions (§24B, §80E, §80EEB) are disabled.</div>}
        {regime === 'old' && <div className="dec-info">Old Regime allows deductions under 80C, 80D, HRA, 24B, etc. Upload proofs below to claim them.</div>}
      </div>

      {/* Declarations */}
      <div className="dec-card">
        <div className="dec-section-label">Declarations <span className="dec-optional">(optional)</span></div>
        {items.length === 0 && <div className="dec-empty">No declarations yet. Click "Add Declaration" to claim deductions, or use "Compare Regimes" above for a guided form.</div>}
        {items.map((item, i) => {
          const sectionLimit = SECTION_LIMITS[item.section];
          const overLimit = sectionLimit && item.declaredAmount > sectionLimit;
          const docs = REQUIRED_DOCS[item.section] || [];
          return (
            <div key={i} className={`dec-item-card ${item.verifyStatus === 'rejected' ? 'dec-item-rejected' : ''} ${regime === 'new' && NEW_REGIME_BLOCKED.has(item.section) ? 'dec-item-blocked' : ''}`}>
              {regime === 'new' && NEW_REGIME_BLOCKED.has(item.section) && (
                <div className="dec-warn">This loan section is not deductible under the New Tax Regime.</div>
              )}
              <div className="dec-item-row">
                <select className="dec-select" value={item.section} disabled={isReadOnly} onChange={e => updateItem(i, 'section', e.target.value)}>
                  {availableSections.map(s => <option key={s} value={s}>{SECTION_LABELS[s] || s}</option>)}
                  {!availableSections.includes(item.section) && <option value={item.section}>{SECTION_LABELS[item.section] || item.section} (blocked)</option>}
                </select>
                <div className="dec-amount-wrap">
                  <input className={`dec-input ${overLimit ? 'dec-input-err' : ''}`} type="number" value={item.declaredAmount} disabled={isReadOnly}
                    max={sectionLimit || undefined}
                    onChange={e => {
                      let v = Number(e.target.value) || 0;
                      if (sectionLimit) v = Math.min(v, sectionLimit);
                      updateItem(i, 'declaredAmount', v);
                    }} placeholder="Amount" />
                  {sectionLimit && <span className="dec-limit">Max: {fmt(sectionLimit)}</span>}
                </div>
                {!isReadOnly && <button className="dec-remove" onClick={() => removeItem(i)}>×</button>}
              </div>
              {overLimit && <div className="dec-warn">Exceeds section limit of {fmt(sectionLimit!)}</div>}
              {item.rejectReason && <div className="dec-warn">Rejected: {item.rejectReason}</div>}

              {/* Required documents for this section */}
              {docs.length > 0 && (
                <div className="dec-required-docs">
                  <span className="dec-docs-label">Required documents (PDF only):</span>
                  <div className="dec-docs-list">
                    {docs.map((d, di) => <span key={di} className="dec-doc-chip">{d}</span>)}
                  </div>
                </div>
              )}

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

              <div className="dec-proof-row">
                <StatusBadge status={item.verifyStatus} />
                {item.proofs.length > 0 && <span className="dec-proof-count">{item.proofs.length} proof{item.proofs.length > 1 ? 's' : ''}</span>}
                {item.proofAmount !== null && item.verifyStatus === 'verified' && <span className="dec-proof-amt">Verified: {fmt(item.proofAmount)}</span>}
                {!isReadOnly && !(regime === 'new' && NEW_REGIME_BLOCKED.has(item.section)) && (
                  <button className="dec-upload-btn" onClick={() => triggerUpload(i)}>Upload PDF</button>
                )}
              </div>
              {item.proofs.length > 0 && (
                <div className="dec-proof-list">
                  {item.proofs.map((p, pi) => <span key={pi} className="dec-proof-file">{p.filename}</span>)}
                </div>
              )}
            </div>
          );
        })}
        {!isReadOnly && <button className="dec-add" onClick={addItem}>+ Add Declaration</button>}
      </div>

      {/* HRA detail */}
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
          {hraExemption > 0 && <div className="dec-hra-result">Computed HRA exemption: {fmt(hraExemption)} / year</div>}
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
        {items.length > 0 && (
          <button className="dec-btn-secondary" onClick={() => navigate('/declarations/compare')}>View Calculation</button>
        )}
      </div>
    </div>
  );
}
