import { useEffect, useState } from 'react';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment, Department } from './pmApi';

export function AdminDepartments() {
  const [deps, setDeps] = useState<Department[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function reload() { listDepartments().then(setDeps).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!name.trim()) return;
    setError('');
    try { await createDepartment(name.trim()); setName(''); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function toggle(d: Department) {
    try { await updateDepartment(d._id, { active: !d.active }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(d: Department) {
    if (!window.confirm(`Delete "${d.name}"?`)) return;
    try { await deleteDepartment(d._id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Departments</h1>
          <p className="ts-sub">{deps.length} department{deps.length === 1 ? '' : 's'}</p>
        </div>
        <div className="ts-nav-left">
          <input className="input" placeholder="New department" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn btn-auto btn-primary" onClick={add}>Add</button>
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Name</th><th className="col-left">Status</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {deps.length === 0 && <tr><td colSpan={3} className="ts-empty">No departments yet.</td></tr>}
            {deps.map((d) => (
              <tr key={d._id} className={d.active ? undefined : 'row-inactive'}>
                <td className="ts-task">{d.name}</td>
                <td className="col-left">
                  <span className={`status-badge ${d.active ? 'status-done' : 'status-archived'}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {d.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action" onClick={() => toggle(d)}>{d.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="table-action danger" onClick={() => remove(d)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
