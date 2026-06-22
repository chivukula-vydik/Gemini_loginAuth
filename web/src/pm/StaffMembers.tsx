import { useCallback, useEffect, useState } from 'react';
import { listCandidates, type Candidate, type CandidatesResponse } from './pmApi';
import { projectFit, FIT_LABEL, roleNote } from './projectFit';
import { initials, personName } from './personName';

const STATUS_LABEL: Record<Candidate['status'], string> = {
  available: 'Available',
  standby: 'Standby',
  busy: 'Busy',
};

function FitCard({ c, busy, onAdd }: { c: Candidate; busy: boolean; onAdd: () => void }) {
  const verdict = projectFit(c);
  const note = roleNote(c.role);
  return (
    <div className={`fit-card fit-${verdict}`}>
      <div className="fit-card-head">
        <span className="person-avatar cand-avatar">{initials({ displayName: c.displayName, email: c.email })}</span>
        <div className="fit-id">
          <span className="cand-name">{personName(c)}</span>
          <span className="fit-role">{c.role}</span>
        </div>
        <span className={`fit-badge fit-${verdict}`}>{FIT_LABEL[verdict]}</span>
      </div>
      <div className="cand-line">
        <span className={`cand-badge cand-${c.status}`}>{STATUS_LABEL[c.status]} · {c.hours}h / {c.capacity}h</span>
        <span className="fit-tasks">{c.activeTaskCount} open {c.activeTaskCount === 1 ? 'task' : 'tasks'}</span>
      </div>
      <div className="cand-bar"><div className={`cand-bar-fill cand-${c.status}`} style={{ width: `${c.loadPct}%` }} /></div>
      {(c.matchedSkills.length > 0 || c.missingSkills.length > 0) && (
        <div className="cand-skills">
          {c.matchedSkills.map((s) => <span key={`m${s}`} className="cand-skill ok">✓ {s}</span>)}
          {c.missingSkills.map((s) => <span key={`x${s}`} className="cand-skill missing">⚠ {s}</span>)}
        </div>
      )}
      {note && <div className="fit-note">{note}</div>}
      <button className="btn btn-auto btn-primary fit-add" type="button" disabled={busy} onClick={onAdd}>Add to project</button>
    </div>
  );
}

export function StaffMembers({ projectId, projectName, onAdd, onBack }: {
  projectId: string; projectName: string;
  onAdd: (userId: string) => Promise<void>; onBack: () => void;
}) {
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
    try { await onAdd(userId); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  }

  const candidates = (data?.candidates ?? []).filter((c) => !c.isMember);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <button className="link-btn" onClick={onBack}>← {projectName}</button>
          <h1 className="ts-h1">Staff members</h1>
          <p className="ts-sub">Sorted by skill fit &amp; availability</p>
        </div>
      </header>
      {error && <p className="ts-error">{error}</p>}
      {!data && <span className="ts-sub">Loading candidates…</span>}
      {data && candidates.length === 0 && <span className="ts-sub">Everyone available is already on this project.</span>}
      <div className="fit-grid">
        {candidates.map((c) => (
          <FitCard key={c._id} c={c} busy={busyId === c._id} onAdd={() => handleAdd(c._id)} />
        ))}
      </div>
    </div>
  );
}
