import { useEffect, useState } from 'react';
import { listLocations, createLocation, updateLocation, deleteLocation, OrgLocation } from './orgApi';

export function OrgLocations() {
  const [items, setItems] = useState<OrgLocation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', country: '', state: '', city: '', address: '', timezone: 'Asia/Kolkata' });
  const [error, setError] = useState('');

  function reload() { listLocations().then(setItems).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!form.name.trim()) return;
    setError('');
    try { await createLocation(form as any); setShowForm(false); setForm({ name: '', code: '', country: '', state: '', city: '', address: '', timezone: 'Asia/Kolkata' }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(item: OrgLocation) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try { await deleteLocation(item._id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="ts-sub">{items.length} location{items.length === 1 ? '' : 's'}</span>
        <button className="btn btn-auto btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add location'}</button>
      </div>

      {showForm && (
        <div className="ts-card card-section" style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <label className="form-field"><span className="form-label">Name *</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Code</span><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Country</span><input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">State</span><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">City</span><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Timezone</span><input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></label>
            <label className="form-field form-field-full"><span className="form-label">Address</span><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn btn-auto btn-primary" onClick={add}>Create</button></div>
        </div>
      )}

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Name</th><th>City</th><th>Country</th><th>Timezone</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="ts-empty">No locations.</td></tr>}
            {items.map((l) => (
              <tr key={l._id}>
                <td className="ts-task">{l.name}{l.code ? ` (${l.code})` : ''}</td>
                <td>{l.city || '—'}</td>
                <td>{l.country || '—'}</td>
                <td>{l.timezone}</td>
                <td className="col-left"><button className="table-action danger" onClick={() => remove(l)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
