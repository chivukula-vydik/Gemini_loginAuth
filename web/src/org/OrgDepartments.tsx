import { useEffect, useState } from 'react';
import { listOrgDepartments, createOrgDepartment, updateOrgDepartment, deleteOrgDepartment, OrgDepartment, listBusinessUnits, BusinessUnit } from './orgApi';

export function OrgDepartments() {
  const [items, setItems] = useState<OrgDepartment[]>([]);
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', businessUnitId: '', parentDepartmentId: '' });
  const [error, setError] = useState('');

  function reload() { listOrgDepartments().then(setItems).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); listBusinessUnits().then(setBus).catch(() => {}); }, []);

  async function add() {
    if (!form.name.trim()) return;
    setError('');
    try {
      await createOrgDepartment({ name: form.name.trim(), description: form.description, businessUnitId: form.businessUnitId || null, parentDepartmentId: form.parentDepartmentId || null } as any);
      setShowForm(false); setForm({ name: '', description: '', businessUnitId: '', parentDepartmentId: '' }); reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function toggle(item: OrgDepartment) {
    try { await updateOrgDepartment(item._id, { active: !item.active } as any); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(item: OrgDepartment) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try { await deleteOrgDepartment(item._id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  const topLevel = items.filter((d) => !d.parentDepartmentId);
  const childrenOf = (id: string) => items.filter((d) => d.parentDepartmentId === id);

  function renderDept(d: OrgDepartment, depth: number): React.ReactNode {
    const children = childrenOf(d._id);
    return (
      <tr key={d._id} className={d.active ? undefined : 'row-inactive'}>
        <td className="ts-task" style={{ paddingLeft: 16 + depth * 20 }}>
          {depth > 0 && <span className="ts-sub" style={{ marginRight: 4 }}>└</span>}
          {d.name}
        </td>
        <td>{d.departmentHeadId?.displayName || '—'}</td>
        <td>{bus.find((b) => b._id === (d.businessUnitId as any))?.name || '—'}</td>
        <td className="col-left">
          <div className="row-actions">
            <button className="table-action" onClick={() => toggle(d)}>{d.active ? 'Deactivate' : 'Activate'}</button>
            <button className="table-action danger" onClick={() => remove(d)}>Delete</button>
          </div>
        </td>
      </tr>
    );
  }

  function renderTree(d: OrgDepartment, depth: number): React.ReactNode[] {
    const rows: React.ReactNode[] = [renderDept(d, depth)];
    for (const c of childrenOf(d._id)) rows.push(...renderTree(c, depth + 1));
    return rows;
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="ts-sub">{items.length} department{items.length === 1 ? '' : 's'}</span>
        <button className="btn btn-auto btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add department'}</button>
      </div>

      {showForm && (
        <div className="ts-card card-section" style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <label className="form-field"><span className="form-label">Name *</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="form-field"><span className="form-label">Business Unit</span>
              <select className="input" value={form.businessUnitId} onChange={(e) => setForm({ ...form, businessUnitId: e.target.value })}>
                <option value="">None</option>
                {bus.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </label>
            <label className="form-field"><span className="form-label">Parent Department</span>
              <select className="input" value={form.parentDepartmentId} onChange={(e) => setForm({ ...form, parentDepartmentId: e.target.value })}>
                <option value="">None (top-level)</option>
                {items.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </label>
            <label className="form-field form-field-full"><span className="form-label">Description</span><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}><button className="btn btn-auto btn-primary" onClick={add}>Create</button></div>
        </div>
      )}

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Department</th><th>Head</th><th>Business Unit</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={4} className="ts-empty">No departments.</td></tr>}
            {topLevel.flatMap((d) => renderTree(d, 0))}
          </tbody>
        </table>
      </div>
    </>
  );
}
