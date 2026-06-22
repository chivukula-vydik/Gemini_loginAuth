import { useEffect, useState } from 'react';
import { listReputation } from './pmApi';
import { companyFit, RELIABILITY_LABEL, type Reputation } from './reputation';
import { initials, personName } from './personName';

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

function Row({ r }: { r: Reputation }) {
  const verdict = companyFit(r);
  return (
    <tr>
      <td className="ts-task">
        <span className="person-pill">
          <span className="person-avatar">{initials(r)}</span>
          {personName(r)}
        </span>
      </td>
      <td className="col-left"><span className={`fit-badge fit-${verdict === 'reliable' ? 'good' : verdict === 'mixed' ? 'ok' : 'poor'}`}>{RELIABILITY_LABEL[verdict]}</span></td>
      <td className="col-left ts-sub">{r.reestimations.total} (↑{r.direction.under} ↓{r.direction.over})</td>
      <td className="col-left ts-sub">{r.completion.done}/{r.completion.assigned} · {pct(r.completion.assigned ? r.completion.rate : null)}</td>
      <td className="col-left ts-sub">{pct(r.onTime.rate)}{r.onTime.avgDelayDays != null ? ` · ${r.onTime.avgDelayDays}d late` : ''}</td>
    </tr>
  );
}

export function CompanyFit() {
  const [people, setPeople] = useState<Reputation[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listReputation().then((d) => setPeople(d.people)).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Company fit</h1>
          <p className="ts-sub">Per-person reliability across all projects</p>
        </div>
      </header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        {!people && <span className="ts-sub">Loading…</span>}
        {people && (
          <table className="ts-table">
            <thead><tr>
              <th className="ts-task">Person</th>
              <th className="col-left">Reliability</th>
              <th className="col-left">Re-estimations</th>
              <th className="col-left">Completion</th>
              <th className="col-left">On-time</th>
            </tr></thead>
            <tbody>{people.map((r) => <Row key={r._id} r={r} />)}</tbody>
          </table>
        )}
      </div>
      <span className="field-hint">On-time and delay only count tasks completed after this feature shipped.</span>
    </div>
  );
}
