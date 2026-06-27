// web/src/payroll/TaxSummary.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './TaxSummary.css';

function currentFY() {
  const now = new Date();
  const y = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `FY${y}-${String(y + 1).slice(2)}`;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function TaxSummary() {
  const fy = currentFY();
  const [slips, setSlips] = useState<{ gross: number; statutory: { pf: number; esic: number; pt: number; tds: number } }[]>([]);
  const [declaration, setDeclaration] = useState<{ regime: string; items: { section: string; declaredAmount: number }[] } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      authed('/payslips/me'),
      authed(`/declarations/${fy}/me`),
    ]).then(([s, d]) => {
      setSlips(s || []);
      setDeclaration(d);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <div className="ts-page">Loading...</div>;

  const totalGross = slips.reduce((s, p) => s + (p.gross || 0), 0);
  const totalPF = slips.reduce((s, p) => s + (p.statutory?.pf || 0), 0);
  const totalESIC = slips.reduce((s, p) => s + (p.statutory?.esic || 0), 0);
  const totalPT = slips.reduce((s, p) => s + (p.statutory?.pt || 0), 0);
  const totalTDS = slips.reduce((s, p) => s + (p.statutory?.tds || 0), 0);
  const totalDeclarations = declaration?.items?.reduce((s, i) => s + (i.declaredAmount || 0), 0) || 0;

  return (
    <div className="ts-page">
      <h1 className="ts-title">Tax Summary — {fy}</h1>
      <div className="ts-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>YTD Summary ({slips.length} months)</div>
        <div className="ts-row"><span className="ts-row-label">Regime</span><span className="ts-row-value">{declaration?.regime?.toUpperCase() || 'NEW'}</span></div>
        <div className="ts-row"><span className="ts-row-label">Gross Earnings</span><span className="ts-row-value">{fmt(totalGross)}</span></div>
        <div className="ts-row"><span className="ts-row-label">PF (Employee)</span><span className="ts-row-value">{fmt(totalPF)}</span></div>
        <div className="ts-row"><span className="ts-row-label">ESIC</span><span className="ts-row-value">{fmt(totalESIC)}</span></div>
        <div className="ts-row"><span className="ts-row-label">Professional Tax</span><span className="ts-row-value">{fmt(totalPT)}</span></div>
        <div className="ts-row"><span className="ts-row-label">TDS Deducted</span><span className="ts-row-value">{fmt(totalTDS)}</span></div>
        {declaration?.regime === 'old' && (
          <div className="ts-row"><span className="ts-row-label">Declared Investments</span><span className="ts-row-value">{fmt(totalDeclarations)}</span></div>
        )}
        <div className="ts-highlight" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Total Tax Paid (YTD)</span><span>{fmt(totalTDS)}</span>
        </div>
      </div>
    </div>
  );
}
