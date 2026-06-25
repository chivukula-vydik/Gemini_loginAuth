import { useEffect, useState } from 'react';
import { listDesignations, createDesignation, updateDesignation, deleteDesignation, Designation } from './orgApi';

export function OrgDesignations() {
  const [items, setItems] = useState<Designation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', grade: '', level: 0, description: '' });
  const [error, setError] = useState('');

  function reload() { listDesignations().then(setItems).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!form.title.trim()) return;
    setError('');
    try { await createDesignation(form as any); setShowForm(false); setForm({ title: '', grade: '', level: 0, description: '' }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function toggle(item: Designation) {
    try { await updateDesignation(item._id, { active: !item.active } as any); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(item: Designation) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try { await deleteDesignation(item._id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="ts-sub">{items.length} designation{items.length === 1 ? '' : 's'}</span>
        <button className="btn btn-auto btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add designation'}</button>
      </div>

      {showForm && (
        <div className="ts-card card-section" style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <label className="form-field"><span className="form-label">Title *</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Grade</span><input className="input" placeholder="e.g. L1, L2" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Level</span><input className="input" type="number" value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} /></label>
            <label className="form-field"><span className="form-label">Description</span><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn btn-auto btn-primary" onClick={add}>Create</button></div>
        </div>
      )}

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Title</th><th>Grade</th><th>Level</th><th className="col-left">Status</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="ts-empty">No designations.</td></tr>}
            {items.map((d) => (
              <tr key={d._id} className={d.active ? undefined : 'row-inactive'}>
                <td className="ts-task">{d.title}</td>
                <td>{d.grade || '—'}</td>
                <td>{d.level}</td>
                <td className="col-left">
                  <span className={`status-badge ${d.active ? 'status-done' : 'status-archived'}`}>
                    <span className="status-dot" aria-hidden="true" />{d.active ? 'Active' : 'Inactive'}
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
    </>
  );
}
