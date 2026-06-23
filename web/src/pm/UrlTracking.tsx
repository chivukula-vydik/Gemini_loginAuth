import { useEffect, useState } from 'react';
import { getUrlSummary, UrlSummary } from './urlTrackingApi';

function formatMs(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const CATEGORY_COLORS: Record<string, string> = {
  productive: 'status-done',
  neutral: 'status-active',
  'non-productive': 'status-archived',
};

export function UrlTracking() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<UrlSummary | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    getUrlSummary(startDate, endDate).then(setSummary).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [startDate, endDate]);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">URL Activity</h1>
          <p className="ts-sub">Productivity insights from tracked URLs</p>
        </div>
        <div className="ts-nav-left">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      {summary && (
        <>
          <div className="ts-tiles">
            {(['productive', 'neutral', 'non-productive'] as const).map((cat) => (
              <div key={cat} className={`ts-tile ${CATEGORY_COLORS[cat]}`}>
                <span className="ts-tile-label">{cat}</span>
                <span className="ts-tile-value">{formatMs(summary.byCategory[cat] || 0)}</span>
              </div>
            ))}
          </div>

          <div className="ts-card">
            <div className="card-title">Top URLs</div>
            <table className="ts-table">
              <thead><tr><th className="ts-task">URL</th><th className="col-left">Category</th><th className="col-left">Time</th></tr></thead>
              <tbody>
                {summary.topUrls.length === 0 && <tr><td colSpan={3} className="ts-empty">No data for this period.</td></tr>}
                {summary.topUrls.map((u, i) => (
                  <tr key={i}>
                    <td className="ts-task">{u.url}</td>
                    <td className="col-left">
                      <span className={`status-badge ${CATEGORY_COLORS[u.category] || ''}`}>
                        <span className="status-dot" aria-hidden="true" />{u.category}
                      </span>
                    </td>
                    <td className="col-left">{formatMs(u.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.byUser.length > 0 && (
            <div className="ts-card">
              <div className="card-title">By Employee</div>
              <table className="ts-table">
                <thead><tr><th className="ts-task">Employee</th><th className="col-left">Total Time</th></tr></thead>
                <tbody>
                  {summary.byUser.map((u) => (
                    <tr key={u.userId}>
                      <td className="ts-task">{u.displayName}</td>
                      <td className="col-left">{formatMs(u.totalMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
