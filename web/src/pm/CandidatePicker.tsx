import { useCallback, useEffect, useState } from 'react';
import { listCandidates, type Candidate, type CandidatesResponse } from './pmApi';
import { initials } from './personName';

const STATUS_LABEL: Record<Candidate['status'], string> = {
  available: 'Available',
  standby: 'Standby',
  busy: 'Busy',
};

function CandidateRow({ c, busy, onAdd }: { c: Candidate; busy: boolean; onAdd: () => void }) {
  return (
    <div className="cand-row">
      <span className="person-avatar cand-avatar">{initials({ displayName: c.displayName, email: c.email })}</span>
      <div className="cand-main">
        <div className="cand-line">
          <span className="cand-name">{c.displayName || c.email}</span>
          <span className={`cand-badge cand-${c.status}`}>{STATUS_LABEL[c.status]} · {c.hours}h / {c.capacity}h</span>
        </div>
        <div className="cand-bar"><div className={`cand-bar-fill cand-${c.status}`} style={{ width: `${c.loadPct}%` }} /></div>
        {(c.matchedSkills.length > 0 || c.missingSkills.length > 0) && (
          <div className="cand-skills">
            {c.matchedSkills.map((s) => <span key={`m${s}`} className="cand-skill ok">✓ {s}</span>)}
            {c.missingSkills.map((s) => <span key={`x${s}`} className="cand-skill missing">⚠ {s}</span>)}
          </div>
        )}
      </div>
      <button className="btn btn-auto btn-primary cand-add" type="button" disabled={busy} onClick={onAdd}>Add</button>
    </div>
  );
}

export function CandidatePicker({ projectId, onAdd }: { projectId: string; onAdd: (userId: string) => Promise<void> }) {
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listCandidates(projectId).then(setData).catch((e) => setError((e as Error).message));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function handleAdd(userId: string) {
    setBusyId(userId);
    setError('');
    try { await onAdd(userId); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  }

  if (error) return <p className="ts-error">{error}</p>;
  if (!data) return <span className="ts-sub">Loading candidates…</span>;

  const candidates = data.candidates.filter((c) => !c.isMember);
  if (candidates.length === 0) return <span className="ts-sub">Everyone available is already on this project.</span>;

  return (
    <div className="cand-list">
      {candidates.map((c) => (
        <CandidateRow key={c._id} c={c} busy={busyId === c._id} onAdd={() => handleAdd(c._id)} />
      ))}
    </div>
  );
}
