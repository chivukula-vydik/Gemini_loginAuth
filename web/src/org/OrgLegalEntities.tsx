import { useEffect, useState } from 'react';
import { listLegalEntities, createLegalEntity, updateLegalEntity, deleteLegalEntity, LegalEntity } from './orgApi';

export function OrgLegalEntities() {
  const [items, setItems] = useState<LegalEntity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', legalName: '', country: 'India', currency: 'INR', address: '', registrationNo: '', gstNumber: '', panNumber: '', authorizedSignatory: '' });
  const [error, setError] = useState('');

  function reload() { listLegalEntities().then(setItems).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!form.name.trim() || !form.legalName.trim()) { setError('Name and Legal Name required'); return; }
    setError('');
    try { await createLegalEntity(form as any); setShowForm(false); setForm({ name: '', legalName: '', country: 'India', currency: 'INR', address: '', registrationNo: '', gstNumber: '', panNumber: '', authorizedSignatory: '' }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function toggle(item: LegalEntity) {
    try { await updateLegalEntity(item._id, { active: !item.active }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(item: LegalEntity) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try { await deleteLegalEntity(item._id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="ts-sub">{items.length} legal {items.length === 1 ? 'entity' : 'entities'}</span>
        <button className="btn btn-auto btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add entity'}</button>
      </div>

      {showForm && (
        <div className="ts-card card-section" style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <label className="form-field"><span className="form-label">Entity name *</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Legal name *</span><input className="input" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Country</span><input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Currency</span><input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></label>
            <label className="form-field form-field-full"><span className="form-label">Address</span><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Registration / CIN</span><input className="input" value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">GST Number</span><input className="input" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">PAN Number</span><input className="input" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Authorized Signatory</span><input className="input" value={form.authorizedSignatory} onChange={(e) => setForm({ ...form, authorizedSignatory: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn btn-auto btn-primary" onClick={add}>Create</button></div>
        </div>
      )}

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Entity</th><th>Legal Name</th><th>Country</th><th>Currency</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="ts-empty">No legal entities.</td></tr>}
            {items.map((e) => (
              <tr key={e._id} className={e.active ? undefined : 'row-inactive'}>
                <td className="ts-task">{e.name}</td>
                <td>{e.legalName}</td>
                <td>{e.country}</td>
                <td>{e.currency}</td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action" onClick={() => toggle(e)}>{e.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="table-action danger" onClick={() => remove(e)}>Delete</button>
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
