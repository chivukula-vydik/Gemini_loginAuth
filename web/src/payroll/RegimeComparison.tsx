import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './RegimeComparison.css';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const SECTION_META: Record<string, { label: string; hint: string; limit: number }> = {
  '80C':       { label: '80C', hint: 'PPF, ELSS, LIC, EPF, tuition fees', limit: 150000 },
  '80D':       { label: '80D', hint: 'Medical insurance premiums', limit: 100000 },
  '80CCD(1B)': { label: '80CCD(1B)', hint: 'NPS (additional ₹50k)', limit: 50000 },
  '24B':       { label: '24B', hint: 'Home loan interest', limit: 200000 },
  '80E':       { label: '80E', hint: 'Education loan interest', limit: Infinity },
  '80G':       { label: '80G', hint: 'Donations', limit: Infinity },
  '80TTA':     { label: '80TTA', hint: 'Savings account interest', limit: 10000 },
  '80EEB':     { label: '80EEB', hint: 'EV loan interest', limit: 150000 },
  '80DDB':     { label: '80DDB', hint: 'Medical treatment (specified diseases)', limit: 100000 },
  '80U':       { label: '80U', hint: 'Disability deduction', limit: 125000 },
};
const SECTION_ORDER = ['80C', '80D', '80CCD(1B)', '24B', '80E', '80G', '80TTA', '80EEB', '80DDB', '80U'];

interface Slab { upTo: number | null; rate: number }
interface SurchargeTier { threshold: number; rate: number }
interface Rebate { maxIncome: number; maxRebate: number }
interface RegimeConfig {
  standardDeduction: number;
  slabs: Slab[];
  rebate?: Rebate;
  surcharge?: SurchargeTier[];
  cessRate?: number;
  allowedDeductions?: string[];
}

interface TaxResult {
  taxable: number;
  slabTax: number;
  taxAfterRebate: number;
  surcharge: number;
  cess: number;
  tax: number;
}

function applySlabs(taxable: number, slabs: Slab[]): number {
  let tax = 0, prev = 0;
  for (const slab of slabs) {
    if (taxable <= prev) break;
    const upper = slab.upTo === null ? taxable : slab.upTo;
    const inSlab = Math.min(taxable, upper) - prev;
    tax += inSlab * slab.rate / 100;
    prev = upper;
  }
  return Math.round(tax);
}

function computeSurchargeWithRelief(taxable: number, taxOnIncome: number, tiers: SurchargeTier[], slabs: Slab[]): number {
  let rate = 0, threshold = 0;
  for (const t of tiers) {
    if (taxable > t.threshold) { rate = t.rate; threshold = t.threshold; }
  }
  if (rate === 0) return 0;
  const surcharge = Math.round(taxOnIncome * rate / 100);
  // marginal relief: total (tax+surcharge) must not exceed (slab tax at threshold) + (income over threshold)
  const slabTaxAtThreshold = applySlabs(threshold, slabs);
  const incomeOverThreshold = taxable - threshold;
  const maxTotal = slabTaxAtThreshold + incomeOverThreshold;
  if (taxOnIncome + surcharge > maxTotal) return Math.max(0, maxTotal - taxOnIncome);
  return surcharge;
}

function computeTax(gross: number, regime: RegimeConfig, deductions: { section: string; declaredAmount: number }[]): TaxResult {
  let taxable = gross - regime.standardDeduction;
  const allowed = new Set(regime.allowedDeductions || []);
  for (const d of deductions) {
    if (allowed.has(d.section)) taxable -= (d.declaredAmount || 0);
  }
  taxable = Math.max(0, taxable);

  const slabTax = applySlabs(taxable, regime.slabs);

  let taxAfterRebate = slabTax;
  if (regime.rebate && taxable <= regime.rebate.maxIncome) {
    taxAfterRebate = Math.max(0, slabTax - regime.rebate.maxRebate);
  }
  if (regime.rebate && taxable > regime.rebate.maxIncome) {
    taxAfterRebate = Math.min(taxAfterRebate, taxable - regime.rebate.maxIncome);
  }

  let surcharge = 0;
  if (regime.surcharge?.length && taxable > regime.surcharge[0]?.threshold) {
    surcharge = computeSurchargeWithRelief(taxable, taxAfterRebate, regime.surcharge, regime.slabs);
  }

  const preCess = taxAfterRebate + surcharge;
  const cess = Math.round(preCess * (regime.cessRate || 0.04));
  return { taxable, slabTax, taxAfterRebate, surcharge, cess, tax: preCess + cess };
}

function TaxColumn({ label, result, recommended, gross }: {
  label: string; result: TaxResult; recommended: boolean; gross: number;
}) {
  const rows = [
    { label: 'Gross Annual', value: gross },
    { label: 'Standard Deduction', value: gross - result.taxable - (gross - result.taxable), negative: true },
    { label: 'Taxable Income', value: result.taxable },
    { label: 'Slab Tax', value: result.slabTax },
    { label: 'After Rebate u/s 87A', value: result.taxAfterRebate },
    { label: 'Surcharge', value: result.surcharge },
    { label: 'Health & Education Cess', value: result.cess },
    { label: 'Total Annual Tax', value: result.tax, highlight: true },
    { label: '≈ Monthly TDS', value: Math.round(result.tax / 12), muted: true },
  ];
  return (
    <div className={`rc-column ${recommended ? 'rc-recommended' : ''}`}>
      <div className="rc-column-header">
        <span className="rc-column-title">{label}</span>
        {recommended && <span className="rc-badge">Recommended</span>}
      </div>
      <div className="rc-rows">
        {rows.map(r => (
          <div key={r.label} className={`rc-row ${r.highlight ? 'rc-row-total' : ''} ${r.muted ? 'rc-row-muted' : ''}`}>
            <span>{r.label}</span>
            <span>{fmt(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ApiData {
  fy: string;
  grossAnnual: number;
  savedRegime: string;
  savedDeclarations: { section: string; declaredAmount: number }[];
  oldRegime: RegimeConfig;
  newRegime: RegimeConfig;
}

export function RegimeComparison() {
  const navigate = useNavigate();
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    authed('/payroll/tax-comparison', 'POST')
      .then((d: ApiData) => {
        setData(d);
        const init: Record<string, number> = {};
        for (const dec of d.savedDeclarations || []) {
          init[dec.section] = dec.declaredAmount || 0;
        }
        setAmounts(init);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const setAmount = useCallback((section: string, val: number) => {
    setAmounts(prev => ({ ...prev, [section]: val }));
  }, []);

  const deductions = useMemo(() =>
    Object.entries(amounts)
      .filter(([, v]) => v > 0)
      .map(([section, declaredAmount]) => ({ section, declaredAmount })),
    [amounts]
  );

  const totalDeductions = useMemo(() => deductions.reduce((s, d) => s + d.declaredAmount, 0), [deductions]);

  const oldResult = useMemo(() =>
    data ? computeTax(data.grossAnnual, data.oldRegime, deductions) : null,
    [data, deductions]
  );
  const newResult = useMemo(() =>
    data ? computeTax(data.grossAnnual, data.newRegime, []) : null,
    [data]
  );

  const savings = oldResult && newResult ? oldResult.tax - newResult.tax : 0;
  const recommendation = savings > 0 ? 'new' : savings < 0 ? 'old' : 'either';
  const betterRegime = recommendation === 'old' ? 'Old' : 'New';

  async function selectRegime(regime: 'old' | 'new') {
    if (!data) return;
    setSaving(true);
    try {
      const items = regime === 'old' ? deductions : [];
      await authed(`/declarations/${data.fy}`, 'POST', { regime, items });
      navigate('/declarations');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rc-page"><div className="rc-loading">Loading comparison...</div></div>;
  if (error) return <div className="rc-page"><div className="rc-error">{error}</div></div>;
  if (!data || !oldResult || !newResult) return null;

  const allowedOld = new Set(data.oldRegime.allowedDeductions || []);

  return (
    <div className="rc-page">
      <div className="rc-header">
        <button className="rc-back" onClick={() => navigate('/declarations')}>← Back to Declarations</button>
        <h1 className="rc-title">Compare Tax Regimes — {data.fy}</h1>
        <div className="rc-gross">Gross Annual Income: {fmt(data.grossAnnual)}</div>
      </div>

      <div className="rc-deductions">
        <h2 className="rc-section-title">Your Deductions (Old Regime)</h2>
        <p className="rc-section-hint">Enter planned investments to see how they affect your tax. New regime doesn't allow these deductions.</p>
        <div className="rc-deduction-grid">
          {SECTION_ORDER.filter(s => allowedOld.has(s)).map(section => {
            const meta = SECTION_META[section];
            const limit = meta?.limit ?? Infinity;
            const val = amounts[section] || 0;
            return (
              <div key={section} className="rc-deduction-item">
                <div className="rc-deduction-label">
                  <span className="rc-deduction-section">§{meta?.label || section}</span>
                  <span className="rc-deduction-hint">{meta?.hint || section}</span>
                </div>
                <div className="rc-deduction-input-wrap">
                  <span className="rc-rupee">₹</span>
                  <input
                    type="number"
                    className="rc-deduction-input"
                    value={val || ''}
                    placeholder="0"
                    min={0}
                    max={limit === Infinity ? undefined : limit}
                    onChange={e => {
                      let n = Math.max(0, Number(e.target.value) || 0);
                      if (limit !== Infinity) n = Math.min(n, limit);
                      setAmount(section, n);
                    }}
                  />
                  {limit !== Infinity && (
                    <span className="rc-deduction-limit">max {fmt(limit)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {totalDeductions > 0 && (
          <div className="rc-deduction-total">Total Deductions: {fmt(totalDeductions)}</div>
        )}
      </div>

      <div className="rc-grid">
        <TaxColumn label="Old Regime" result={oldResult} recommended={recommendation === 'old'} gross={data.grossAnnual} />
        <TaxColumn label="New Regime" result={newResult} recommended={recommendation === 'new' || recommendation === 'either'} gross={data.grossAnnual} />
      </div>

      {Math.abs(savings) > 0 && (
        <div className="rc-savings">
          You save {fmt(Math.abs(savings))}/year with the {betterRegime} Regime
        </div>
      )}

      <div className="rc-disclaimer">
        ≈ Monthly figures are illustrative (annual tax ÷ 12). Actual TDS is recomputed each payroll run based on YTD actuals.
      </div>

      <div className="rc-actions">
        <button
          className={`rc-select-btn ${data.savedRegime === 'old' ? 'current' : ''}`}
          onClick={() => selectRegime('old')}
          disabled={saving}
        >
          {data.savedRegime === 'old' ? 'Current: Old Regime' : 'Select Old Regime'}
        </button>
        <button
          className={`rc-select-btn ${data.savedRegime === 'new' ? 'current' : ''}`}
          onClick={() => selectRegime('new')}
          disabled={saving}
        >
          {data.savedRegime === 'new' ? 'Current: New Regime' : 'Select New Regime'}
        </button>
      </div>
    </div>
  );
}
