import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './RegimeComparison.css';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

interface WaterfallResult {
  taxable: number;
  slabTax: number;
  taxAfterRebate: number;
  surcharge: number;
  preCessTax: number;
  cess: number;
  tax: number;
  approxMonthly: number;
}

interface ComparisonData {
  fy: string;
  grossAnnual: number;
  savedRegime: string;
  old: WaterfallResult;
  new: WaterfallResult;
  recommendation: 'old' | 'new' | 'either';
  savingsDelta: number;
}

function WaterfallColumn({ label, data, recommended, grossAnnual }: {
  label: string;
  data: WaterfallResult;
  recommended: boolean;
  grossAnnual: number;
}) {
  const rows = [
    { label: 'Gross Annual', value: grossAnnual },
    { label: 'Taxable Income', value: data.taxable },
    { label: 'Slab Tax', value: data.slabTax },
    { label: 'After Rebate u/s 87A', value: data.taxAfterRebate },
    { label: 'Surcharge', value: data.surcharge },
    { label: 'Health & Education Cess', value: data.cess },
    { label: 'Total Annual Tax', value: data.tax, highlight: true },
    { label: '≈ Monthly', value: data.approxMonthly, muted: true },
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

export function RegimeComparison() {
  const navigate = useNavigate();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authed('/payroll/tax-comparison', 'POST')
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function selectRegime(regime: 'old' | 'new') {
    if (!data) return;
    setSaving(true);
    try {
      await authed(`/declarations/${data.fy}`, 'POST', {
        regime,
        items: regime === 'new' ? [] : undefined,
      });
      navigate('/declarations');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rc-page"><div className="rc-loading">Loading comparison...</div></div>;
  if (error) return <div className="rc-page"><div className="rc-error">{error}</div></div>;
  if (!data) return null;

  return (
    <div className="rc-page">
      <div className="rc-header">
        <button className="rc-back" onClick={() => navigate('/declarations')}>← Back to Declarations</button>
        <h1 className="rc-title">Compare & Choose Tax Regime — {data.fy}</h1>
        <div className="rc-gross">Your Gross Annual: {fmt(data.grossAnnual)}</div>
      </div>

      <div className="rc-grid">
        <WaterfallColumn
          label="Old Regime"
          data={data.old}
          recommended={data.recommendation === 'old'}
          grossAnnual={data.grossAnnual}
        />
        <WaterfallColumn
          label="New Regime"
          data={data.new}
          recommended={data.recommendation === 'new' || data.recommendation === 'either'}
          grossAnnual={data.grossAnnual}
        />
      </div>

      {data.savingsDelta > 0 && (
        <div className="rc-savings">
          You save {fmt(data.savingsDelta)} per year with the {data.recommendation === 'old' ? 'Old' : 'New'} Regime
        </div>
      )}

      <div className="rc-disclaimer">
        ≈ Monthly figures are illustrative (annual tax ÷ 12). Your actual monthly TDS is recomputed each payroll run based on YTD actuals and may differ.
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
