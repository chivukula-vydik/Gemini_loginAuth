import { useEffect, useMemo, useState } from 'react';
import { listSkills, setMySkills, Skill } from './pmApi';
import { useAuth } from '../authContext';

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function MySkills() {
  const { user, reload } = useAuth();
  const initial = useMemo(() => new Set(user?.skills ?? []), [user?.skills]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { listSkills().then(setSkills).catch((e) => setError(e.message)); }, []);

  const dirty = !sameSet(selected, initial);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = skills.filter((s) => s.active);
    return q ? active.filter((s) => s.name.toLowerCase().includes(q)) : active;
  }, [skills, query]);

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      await setMySkills([...selected]);
      await reload();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSaved(false);
    setSelected(new Set(initial));
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">My Skills</h1>
          <p className="ts-sub">Pick the skills you can be matched on. Project managers use these to staff tasks.</p>
        </div>
        <span className="ts-badge">{selected.size} selected</span>
      </header>

      {error && <p className="ts-error">{error}</p>}

      <div className="skill-toolbar">
        <div className="skill-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input className="input" placeholder="Search skills…" value={query}
            onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="ts-card skill-card">
        {filtered.length === 0 ? (
          <p className="ts-empty">{skills.length === 0 ? 'No skills available yet.' : 'No skills match your search.'}</p>
        ) : (
          <div className="skill-grid">
            {filtered.map((s) => {
              const on = selected.has(s._id);
              return (
                <button key={s._id} type="button"
                  className={`skill-tile${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggle(s._id)}>
                  <span className="skill-check" aria-hidden="true">
                    {on && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span className="skill-name">{s.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="skill-bar">
        <span className="ts-sub">
          {dirty ? 'You have unsaved changes' : saved ? 'All changes saved' : `${selected.size} skill${selected.size === 1 ? '' : 's'} on your profile`}
        </span>
        <div className="ts-nav-left">
          {dirty && <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={reset}>Reset</button>}
          <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
