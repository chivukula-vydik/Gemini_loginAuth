import { useEffect, useState } from 'react';
import { listBusinessUnits, createBusinessUnit, updateBusinessUnit, deleteBusinessUnit, BusinessUnit, listLegalEntities, LegalEntity } from './orgApi';

export function OrgBusinessUnits() {
  const [items, setItems] = useState<BusinessUnit[]>([]);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', code: '', email: '', legalEntityId: '' });
  const [error, setError] = useState('');

  function reload() { listBusinessUnits().then(setItems).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); listLegalEntities().then(setEntities).catch(() => {}); }, []);

  async function add() {
    if (!form.name.trim()) return;
    setError('');
    try { await createBusinessUnit({ ...form, legalEntityId: form.legalEntityId || null } as any); setShowForm(false); setForm({ name: '', description: '', code: '', email: '', legalEntityId: '' }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function toggle(item: BusinessUnit) {
    try { await updateBusinessUnit(item._id, { active: !item.active } as any); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(item: BusinessUnit) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try { await deleteBusinessUnit(item._id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="ts-sub">{items.length} business unit{items.length === 1 ? '' : 's'}</span>
        <button className="btn btn-auto btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add unit'}</button>
      </div>

      {showForm && (
        <div className="ts-card card-section" style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <label className="form-field"><span className="form-label">Name *</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Code</span><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
            <label className="form-field form-field-full"><span className="form-label">Description</span><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Group email</span><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Legal entity</span>
              <select className="input" value={form.legalEntityId} onChange={(e) => setForm({ ...form, legalEntityId: e.target.value })}>
                <option value="">None</option>
                {entities.map((le) => <option key={le._id} value={le._id}>{le.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn btn-auto btn-primary" onClick={add}>Create</button></div>
        </div>
      )}

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Name</th><th>Code</th><th>Head</th><th>Entity</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="ts-empty">No business units.</td></tr>}
            {items.map((b) => (
              <tr key={b._id} className={b.active ? undefined : 'row-inactive'}>
                <td className="ts-task">{b.name}</td>
                <td>{b.code || '—'}</td>
                <td>{b.headId?.displayName || '—'}</td>
                <td>{entities.find((e) => e._id === (b.legalEntityId as any))?.name || '—'}</td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action" onClick={() => toggle(b)}>{b.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="table-action danger" onClick={() => remove(b)}>Delete</button>
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
