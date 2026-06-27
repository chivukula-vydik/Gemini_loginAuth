// web/src/payroll/SalaryEditor.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './SalaryEditor.css';
import './PayrollRunDetail.css';

interface Component {
  key: string;
  label: string;
  type: 'earning' | 'deduction';
  calc: 'fixed' | 'percent_of_basic' | 'percent_of_ctc';
  value: number;
  taxable: boolean;
  proratable: boolean;
}

export function SalaryEditor() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [ctcAnnual, setCtcAnnual] = useState(0);
  const [components, setComponents] = useState<Component[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed(`/salary/${userId}`).then(data => {
      if (data) {
        setCtcAnnual(data.ctcAnnual);
        setComponents(data.components);
        setEffectiveFrom(data.effectiveFrom);
      } else {
        authed(`/salary/${userId}/template`).then(tmpl => {
          if (tmpl?.components?.length) setComponents(tmpl.components);
        });
      }
      setLoaded(true);
    });
  }, [userId]);

  function updateComp(idx: number, field: string, val: unknown) {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));
  }

  function removeComp(idx: number) {
    setComponents(prev => prev.filter((_, i) => i !== idx));
  }

  function addComp() {
    setComponents(prev => [...prev, { key: '', label: '', type: 'earning', calc: 'fixed', value: 0, taxable: true, proratable: true }]);
  }

  async function save() {
    setSaving(true);
    await authed(`/salary/${userId}`, 'POST', { ctcAnnual, components, effectiveFrom: effectiveFrom || new Date().toISOString().slice(0, 10) });
    setSaving(false);
    navigate(-1);
  }

  const basicComp = components.find(c => c.key === 'basic');
  const annualBasic = basicComp?.calc === 'fixed' ? basicComp.value : 0;

  function monthlyVal(c: Component) {
    if (c.calc === 'fixed') return c.value / 12;
    if (c.calc === 'percent_of_basic') return (c.value / 100) * (annualBasic / 12);
    if (c.calc === 'percent_of_ctc') return (c.value / 100) * (ctcAnnual / 12);
    return 0;
  }

  const totalMonthly = components.filter(c => c.type === 'earning').reduce((s, c) => s + monthlyVal(c), 0);
  const totalAnnual = totalMonthly * 12;

  if (!loaded) return <div className="se-page">Loading...</div>;

  return (
    <div className="se-page">
      <button className="prd-back" onClick={() => navigate(-1)}>← Back</button>
      <h1 className="se-title">Salary Structure</h1>

      <div className="se-card">
        <div className="se-card-title">Annual CTC</div>
        <input className="se-input" type="number" value={ctcAnnual} onChange={e => setCtcAnnual(Number(e.target.value))} style={{ maxWidth: 200 }} />
        <div style={{ marginTop: 10 }}>
          <label className="se-card-title" style={{ marginBottom: 4, display: 'block' }}>Effective From</label>
          <input className="se-input" type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
      </div>

      <div className="se-card">
        <div className="se-card-title">Components</div>
        <div className="se-row se-row-header">
          <span>Label</span><span>Calc</span><span>Value</span><span>Monthly</span><span></span>
        </div>
        {components.map((c, i) => (
          <div key={i} className="se-row">
            <input className="se-input" value={c.label} onChange={e => updateComp(i, 'label', e.target.value)} placeholder="Component name" />
            <select className="se-select" value={c.calc} onChange={e => updateComp(i, 'calc', e.target.value)}>
              <option value="fixed">Fixed (Annual)</option>
              <option value="percent_of_basic">% of Basic</option>
              <option value="percent_of_ctc">% of CTC</option>
            </select>
            <input className="se-input" type="number" value={c.value} onChange={e => updateComp(i, 'value', Number(e.target.value))} />
            <span style={{ fontSize: 13, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(monthlyVal(c))}
            </span>
            <button className="se-remove" onClick={() => removeComp(i)}>×</button>
          </div>
        ))}
        <button className="se-add-btn" onClick={addComp}>+ Add Component</button>
      </div>

      <div className="se-footer">
        <div>
          <div className="se-total">Monthly: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalMonthly)}</div>
          <div className="se-total-sub">Annual: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalAnnual)} (CTC: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(ctcAnnual)})</div>
        </div>
        <button className="pr-btn" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Revision'}</button>
      </div>
    </div>
  );
}
