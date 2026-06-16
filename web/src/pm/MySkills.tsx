import { useEffect, useState } from 'react';
import { listSkills, setMySkills, Skill } from './pmApi';
import { useAuth } from '../authContext';

export function MySkills() {
  const { user, reload } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(user?.skills ?? []));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { listSkills().then(setSkills).catch((e) => setError(e.message)); }, []);

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
    try {
      await setMySkills([...selected]);
      await reload();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">My Skills</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="chips" style={{ justifyContent: 'flex-start' }}>
        {skills.map((s) => (
          <button key={s._id} type="button"
            className="chip" style={{ cursor: 'pointer', opacity: selected.has(s._id) ? 1 : 0.4 }}
            onClick={() => toggle(s._id)}>
            {s.name}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={save}>Save</button>
        {saved && <span className="ts-sub" style={{ marginLeft: 10 }}>Saved.</span>}
      </div>
    </div>
  );
}
