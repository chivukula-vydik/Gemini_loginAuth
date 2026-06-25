import { useEffect, useState } from 'react';
import { getTeamStats, TeamMemberStats } from './attendanceApi';

function fmtHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function TeamAttendance() {
  const ref = new Date();
  const [year, setYear] = useState(ref.getFullYear());
  const [month, setMonth] = useState(ref.getMonth() + 1);
  const [stats, setStats] = useState<TeamMemberStats[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getTeamStats(year, month).then(setStats).catch((e) => setError(e.message));
  }, [year, month]);

  const monthLabel = new Date(year, month - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  const avgAll = stats.length > 0
    ? Math.round(stats.reduce((s, m) => s + m.avgMinutesPerDay, 0) / stats.length)
    : 0;
  const avgOnTime = stats.length > 0
    ? Math.round(stats.reduce((s, m) => s + m.onTimePct, 0) / stats.length)
    : 0;

  return (
    <div>
      <div className="team-att-nav">
        <button className="ts-arrow" onClick={prevMonth}>&lt;</button>
        <span className="team-att-month">{monthLabel}</span>
        <button className="ts-arrow" onClick={nextMonth}>&gt;</button>
      </div>

      {stats.length > 0 && (
        <div className="ts-tiles" style={{ marginBottom: 18 }}>
          <div className="ts-tile ts-tile-accent">
            <span className="ts-tile-label">Team Size</span>
            <span className="ts-tile-value">{stats.length}</span>
          </div>
          <div className="ts-tile">
            <span className="ts-tile-label">Avg Hours / Day</span>
            <span className="ts-tile-value">{fmtHM(avgAll)}</span>
          </div>
          <div className="ts-tile">
            <span className="ts-tile-label">On-Time Rate</span>
            <span className="ts-tile-value">{avgOnTime}%</span>
          </div>
        </div>
      )}

      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Employee</th>
              <th>Days Present</th>
              <th>Late</th>
              <th>Avg / Day</th>
              <th>On Time %</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 && (
              <tr><td colSpan={5} className="ts-empty">No team members found.</td></tr>
            )}
            {stats.map((m) => (
              <tr key={m.userId}>
                <td className="ts-task">{m.displayName || m.email}</td>
                <td>{m.presentCount}</td>
                <td>{m.lateCount}</td>
                <td>{fmtHM(m.avgMinutesPerDay)}</td>
                <td>{m.onTimePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
