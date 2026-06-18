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

  const activeCount = skills.filter((s) => s.active).length;
  const inactiveCount = skills.length - activeCount;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Skills</h1>
          <p className="ts-sub">{skills.length} skill{skills.length === 1 ? '' : 's'} in the catalog</p>
        </div>
        <div className="ts-nav-left">
          <input className="input" placeholder="New skill" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn btn-auto btn-primary" onClick={add}>Add</button>
        </div>
      </header>

      <div className="ts-tiles">
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Total skills</span>
          <span className="ts-tile-value">{skills.length}</span>
        </div>
        <div className="ts-tile stat-done">
          <span className="ts-tile-label">Active</span>
          <span className="ts-tile-value">{activeCount}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">Inactive</span>
          <span className="ts-tile-value">{inactiveCount}</span>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Skill</th><th className="col-left">Status</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {skills.length === 0 && <tr><td colSpan={3} className="ts-empty">No skills yet. Add one above.</td></tr>}
            {skills.map((s) => (
              <tr key={s._id} className={s.active ? undefined : 'row-inactive'}>
                <td className="ts-task">{s.name}</td>
                <td className="col-left">
                  <span className={`status-badge ${s.active ? 'status-done' : 'status-archived'}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="col-left">
                  <button className="table-action" onClick={() => toggle(s)}>{s.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
