// web/src/payroll/MyPayslips.tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './MyPayslips.css';

interface PayslipSummary {
  _id: string;
  period: { month: number; year: number };
  gross: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  paidDays: number;
}

interface PayslipDetail extends PayslipSummary {
  earnings: { key: string; label: string; amount: number }[];
  deductions: { key: string; label: string; amount: number }[];
  reimbursements: { key: string; label: string; amount: number }[];
  statutory: { pf: number; esic: number; pt: number; tds: number };
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function MyPayslips() {
  const { year, month } = useParams<{ year?: string; month?: string }>();
  const [slips, setSlips] = useState<PayslipSummary[]>([]);
  const [detail, setDetail] = useState<PayslipDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (year && month) {
      authed(`/payslips/me/${year}/${month}`).then(d => { setDetail(d); setLoading(false); });
    } else {
      authed('/payslips/me').then(d => { setSlips(d); setLoading(false); });
    }
  }, [year, month]);

  if (loading) return <div className="mp-page"><div className="mp-empty">Loading...</div></div>;

  if (detail) {
    return (
      <div className="mp-page">
        <h1 className="mp-title">Payslip — {MONTHS[detail.period.month - 1]} {detail.period.year}</h1>
        <div className="mp-detail">
          <div className="mp-section">
            <div className="mp-section-title">Earnings</div>
            {detail.earnings.map(e => (
              <div key={e.key} className="mp-line"><span className="mp-line-label">{e.label}</span><span className="mp-line-amount">{fmt(e.amount)}</span></div>
            ))}
          </div>
          {detail.reimbursements.length > 0 && (
            <div className="mp-section">
              <div className="mp-section-title">Reimbursements</div>
              {detail.reimbursements.map(r => (
                <div key={r.key} className="mp-line"><span className="mp-line-label">{r.label}</span><span className="mp-line-amount">{fmt(r.amount)}</span></div>
              ))}
            </div>
          )}
          <div className="mp-section">
            <div className="mp-section-title">Deductions</div>
            {detail.statutory.pf > 0 && <div className="mp-line"><span className="mp-line-label">PF (Employee)</span><span className="mp-line-amount">{fmt(detail.statutory.pf)}</span></div>}
            {detail.statutory.esic > 0 && <div className="mp-line"><span className="mp-line-label">ESIC</span><span className="mp-line-amount">{fmt(detail.statutory.esic)}</span></div>}
            {detail.statutory.pt > 0 && <div className="mp-line"><span className="mp-line-label">Professional Tax</span><span className="mp-line-amount">{fmt(detail.statutory.pt)}</span></div>}
            {detail.statutory.tds > 0 && <div className="mp-line"><span className="mp-line-label">TDS</span><span className="mp-line-amount">{fmt(detail.statutory.tds)}</span></div>}
            {detail.deductions.map(d => (
              <div key={d.key} className="mp-line"><span className="mp-line-label">{d.label}</span><span className="mp-line-amount">{fmt(d.amount)}</span></div>
            ))}
          </div>
          <div className="mp-total-line"><span>Gross</span><span>{fmt(detail.gross)}</span></div>
          <div className="mp-total-line"><span>Total Deductions</span><span>{fmt(detail.totalDeductions)}</span></div>
          <div className="mp-total-line" style={{ color: 'var(--primary)' }}><span>Net Pay</span><span>{fmt(detail.netPay)}</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Paid Days: {detail.paidDays} · LOP: {detail.lopDays}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-page">
      <h1 className="mp-title">My Payslips</h1>
      {slips.length === 0 ? (
        <div className="mp-empty">No payslips found.</div>
      ) : (
        <div className="mp-list">
          {slips.map(s => (
            <a key={s._id} className="mp-item" href={`/my-payslips/${s.period.year}/${s.period.month}`}>
              <div>
                <div className="mp-period">{MONTHS[s.period.month - 1]} {s.period.year}</div>
                <div className="mp-meta">Paid Days: {s.paidDays} · LOP: {s.lopDays}</div>
              </div>
              <div className="mp-net">{fmt(s.netPay)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
