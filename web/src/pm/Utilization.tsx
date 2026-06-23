import { useEffect, useState } from 'react';
import { getUtilization, UtilizationReport } from './utilizationApi';
import { formatMinutes } from '../timesheet/time';

export function Utilization() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<UtilizationReport | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    getUtilization(startDate, endDate).then(setReport).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [startDate, endDate]);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Utilization</h1>
          <p className="ts-sub">Billable hours and employee utilization</p>
        </div>
        <div className="ts-nav-left">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      {report && (
        <>
          <div className="ts-tiles">
            <div className="ts-tile ts-tile-accent">
              <span className="ts-tile-label">Utilization</span>
              <span className="ts-tile-value">{report.summary.utilizationPct}%</span>
            </div>
            <div className="ts-tile stat-done">
              <span className="ts-tile-label">Billable</span>
              <span className="ts-tile-value">{formatMinutes(report.summary.billableMinutes)}</span>
            </div>
            <div className="ts-tile stat-logged">
              <span className="ts-tile-label">Non-Billable</span>
              <span className="ts-tile-value">{formatMinutes(report.summary.nonBillableMinutes)}</span>
            </div>
            <div className="ts-tile stat-tasks">
              <span className="ts-tile-label">Total</span>
              <span className="ts-tile-value">{formatMinutes(report.summary.totalMinutes)}</span>
            </div>
          </div>

          <div className="ts-card">
            <table className="ts-table">
              <thead>
                <tr>
                  <th className="ts-task">Employee</th>
                  <th className="col-left">Billable</th>
                  <th className="col-left">Non-Billable</th>
                  <th className="col-left">Total</th>
                  <th className="col-left">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.length === 0 && <tr><td colSpan={5} className="ts-empty">No data for this period.</td></tr>}
                {report.employees.map((e) => (
                  <tr key={e.userId}>
                    <td className="ts-task">{e.displayName}</td>
                    <td className="col-left">{formatMinutes(e.billableMinutes)}</td>
                    <td className="col-left">{formatMinutes(e.nonBillableMinutes)}</td>
                    <td className="col-left">{formatMinutes(e.totalMinutes)}</td>
                    <td className="col-left">
                      <div className="prog">
                        <div className="prog-track">
                          <div className={`prog-fill ${e.utilizationPct >= 80 ? 'done' : e.utilizationPct > 0 ? 'mid' : 'low'}`}
                            style={{ width: `${e.utilizationPct}%` }} />
                        </div>
                        <span className="prog-pct">{e.utilizationPct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
