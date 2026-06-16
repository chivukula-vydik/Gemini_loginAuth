import { useEffect, useState } from 'react';
import { listSkills, addSkill, updateSkill, Skill } from './pmApi';

export function AdminSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function reload() { listSkills().then(setSkills).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!name.trim()) return;
    setError('');
    try { await addSkill(name.trim()); setName(''); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function toggle(s: Skill) {
    try { await updateSkill(s._id, { active: !s.active }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Skills</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-nav-left" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="New skill" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-primary" onClick={add}>Add</button>
      </div>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Skill</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s._id}>
                <td className="ts-task">{s.name}</td>
                <td>{s.active ? 'active' : 'inactive'}</td>
                <td><button className="link-btn" onClick={() => toggle(s)}>{s.active ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
