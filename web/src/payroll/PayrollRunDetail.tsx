// web/src/payroll/PayrollRunDetail.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './PayrollRunDetail.css';
import './PayrollRunList.css';

interface Payslip {
  _id: string;
  user: { _id: string; displayName: string; email: string; employeeCode: string };
  gross: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  paidDays: number;
}

interface RunData {
  run: {
    _id: string;
    period: { month: number; year: number };
    status: string;
    runType: string;
    payGroup: { name: string };
    totals: { gross: number; deductions: number; netPay: number; headcount: number };
  };
  payslips: Payslip[];
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);

  async function load() {
    setLoading(true);
    const d = await authed(`/payroll/runs/${id}`);
    setData(d);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function compute() {
    setComputing(true);
    await authed(`/payroll/runs/${id}/compute`, 'POST');
    await load();
    setComputing(false);
  }

  async function lock() {
    await authed(`/payroll/runs/${id}/lock`, 'POST');
    await load();
  }

  async function reopen() {
    await authed(`/payroll/runs/${id}/reopen`, 'POST');
    await load();
  }

  async function disburse() {
    await authed(`/payroll/runs/${id}/disburse`, 'POST');
    await load();
  }

  if (loading || !data) return <div className="prd-page"><div className="prd-empty">Loading...</div></div>;

  const { run, payslips } = data;

  return (
    <div className="prd-page">
      <button className="prd-back" onClick={() => navigate('/payroll')}>← Back to Runs</button>

      <div className="prd-header">
        <div>
          <h1 className="prd-title">{MONTHS[run.period.month - 1]} {run.period.year} — {run.payGroup?.name}</h1>
          <span className={`pr-status ${run.status}`}>{run.status}</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{run.runType}</span>
        </div>
        <div className="prd-actions">
          {(run.status === 'DRAFT' || run.status === 'REVIEW') && (
            <button className="pr-btn" onClick={compute} disabled={computing}>
              {computing ? 'Computing...' : 'Compute'}
            </button>
          )}
          {run.status === 'REVIEW' && <button className="pr-btn" onClick={lock}>Lock</button>}
          {run.status === 'LOCKED' && (
            <>
              <button className="pr-btn" onClick={disburse}>Mark Paid</button>
              <button className="pr-btn-cancel" onClick={reopen}>Reopen</button>
            </>
          )}
        </div>
      </div>

      <div className="prd-totals">
        <div className="prd-tile"><div className="prd-tile-label">Gross</div><div className="prd-tile-value">{fmt(run.totals.gross)}</div></div>
        <div className="prd-tile"><div className="prd-tile-label">Deductions</div><div className="prd-tile-value">{fmt(run.totals.deductions)}</div></div>
        <div className="prd-tile"><div className="prd-tile-label">Net Pay</div><div className="prd-tile-value">{fmt(run.totals.netPay)}</div></div>
        <div className="prd-tile"><div className="prd-tile-label">Headcount</div><div className="prd-tile-value">{run.totals.headcount}</div></div>
      </div>

      {computing && <div className="prd-computing">Computing payroll...</div>}

      {payslips.length === 0 ? (
        <div className="prd-empty">No payslips generated yet. Click "Compute" to run the pipeline.</div>
      ) : (
        <table className="prd-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Code</th>
              <th>Paid Days</th>
              <th>LOP</th>
              <th style={{ textAlign: 'right' }}>Gross</th>
              <th style={{ textAlign: 'right' }}>Deductions</th>
              <th style={{ textAlign: 'right' }}>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {payslips.map(slip => (
              <tr key={slip._id}>
                <td>{slip.user?.displayName || '—'}</td>
                <td>{slip.user?.employeeCode || '—'}</td>
                <td>{slip.paidDays}</td>
                <td>{slip.lopDays}</td>
                <td className="num">{fmt(slip.gross)}</td>
                <td className="num">{fmt(slip.totalDeductions)}</td>
                <td className="num">{fmt(slip.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
