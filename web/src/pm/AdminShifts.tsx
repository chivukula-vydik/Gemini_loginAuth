import { useEffect, useState } from 'react';
import { listShifts, createShift, updateShift, deleteShift, ShiftDef } from './pmApi';

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtTime(h: number, m: number) { return `${pad(h)}:${pad(m)}`; }

export function AdminShifts() {
  const [shifts, setShifts] = useState<ShiftDef[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, isDefault: false });

  function reload() { listShifts().then(setShifts).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!form.name.trim()) return;
    setError('');
    try {
      await createShift({ ...form, name: form.name.trim() });
      setForm({ name: '', startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, isDefault: false });
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function toggle(s: ShiftDef) {
    try { await updateShift(s._id, { active: !s.active }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function makeDefault(s: ShiftDef) {
    try { await updateShift(s._id, { isDefault: true }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(s: ShiftDef) {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    try { await deleteShift(s._id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  function parseTime(val: string): [number, number] {
    const [h, m] = val.split(':').map(Number);
    return [h || 0, m || 0];
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Shifts</h1>
          <p className="ts-sub">{shifts.length} shift{shifts.length === 1 ? '' : 's'} configured</p>
        </div>
      </header>

      <div className="ts-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="shift-form">
          <input className="input" placeholder="Shift name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="shift-label">
            Start
            <input className="input" type="time" value={fmtTime(form.startHour, form.startMinute)}
              onChange={(e) => { const [h, m] = parseTime(e.target.value); setForm({ ...form, startHour: h, startMinute: m }); }} />
          </label>
          <label className="shift-label">
            End
            <input className="input" type="time" value={fmtTime(form.endHour, form.endMinute)}
              onChange={(e) => { const [h, m] = parseTime(e.target.value); setForm({ ...form, endHour: h, endMinute: m }); }} />
          </label>
          <label className="shift-label">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            Default
          </label>
          <button className="btn btn-auto btn-primary" onClick={add}>Add shift</button>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Name</th><th>Timing</th><th>Default</th><th className="col-left">Status</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {shifts.length === 0 && <tr><td colSpan={5} className="ts-empty">No shifts yet.</td></tr>}
            {shifts.map((s) => (
              <tr key={s._id} className={s.active ? undefined : 'row-inactive'}>
                <td className="ts-task">{s.name}</td>
                <td>{fmtTime(s.startHour, s.startMinute)} – {fmtTime(s.endHour, s.endMinute)}</td>
                <td>{s.isDefault ? 'Yes' : '—'}</td>
                <td className="col-left">
                  <span className={`status-badge ${s.active ? 'status-done' : 'status-archived'}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="col-left">
                  <div className="row-actions">
                    {!s.isDefault && s.active && <button className="table-action" onClick={() => makeDefault(s)}>Set default</button>}
                    <button className="table-action" onClick={() => toggle(s)}>{s.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="table-action danger" onClick={() => remove(s)}>Delete</button>
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
