// web/src/payroll/Declarations.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './Declarations.css';

interface Item { section: string; declaredAmount: number; }

const SECTIONS = ['80C', '80D', '80E', '80G', 'HRA', '24B', '80CCD(1B)', '80TTA'];

function currentFY() {
  const now = new Date();
  const y = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `FY${y}-${String(y + 1).slice(2)}`;
}

export function Declarations() {
  const fy = currentFY();
  const [regime, setRegime] = useState<'old' | 'new'>('new');
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed(`/declarations/${fy}/me`).then(d => {
      if (d) {
        setRegime(d.regime);
        setItems(d.items.map((i: Item) => ({ section: i.section, declaredAmount: i.declaredAmount })));
      }
      setLoaded(true);
    });
  }, []);

  function updateItem(idx: number, field: string, val: unknown) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  function addItem() { setItems(prev => [...prev, { section: '80C', declaredAmount: 0 }]); }

  async function save() {
    setSaving(true);
    await authed(`/declarations/${fy}`, 'POST', { regime, items });
    setSaving(false);
  }

  if (!loaded) return <div className="dec-page">Loading...</div>;

  return (
    <div className="dec-page">
      <h1 className="dec-title">Investment Declaration — {fy}</h1>
      <div className="dec-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Tax Regime</div>
        <div className="dec-regime">
          <button className={`dec-regime-btn ${regime === 'new' ? 'active' : ''}`} onClick={() => setRegime('new')}>New Regime</button>
          <button className={`dec-regime-btn ${regime === 'old' ? 'active' : ''}`} onClick={() => setRegime('old')}>Old Regime</button>
        </div>
        {regime === 'new' && <div className="dec-info">Under new regime, no deductions apply. Your declarations are recorded but won't reduce TDS.</div>}
      </div>

      <div className="dec-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Declarations</div>
        {items.map((item, i) => (
          <div key={i} className="dec-item">
            <select className="se-select" value={item.section} onChange={e => updateItem(i, 'section', e.target.value)}>
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="se-input" type="number" value={item.declaredAmount} onChange={e => updateItem(i, 'declaredAmount', Number(e.target.value))} placeholder="Amount" />
            <button className="se-remove" onClick={() => removeItem(i)}>×</button>
          </div>
        ))}
        <button className="dec-add" onClick={addItem}>+ Add Declaration</button>
      </div>

      <div className="dec-actions">
        <button className="pr-btn" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Declaration'}</button>
      </div>
    </div>
  );
}
