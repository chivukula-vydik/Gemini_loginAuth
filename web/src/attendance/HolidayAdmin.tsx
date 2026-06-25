import { useEffect, useState } from 'react';
import { getHolidays, addHoliday, deleteHoliday, Holiday } from './holidaysApi';

export function HolidayAdmin() {
  const year = new Date().getFullYear();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function load() {
    getHolidays(year).then(setHolidays).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!date || !name.trim()) return;
    setError('');
    try { await addHoliday(date, name.trim()); setDate(''); setName(''); load(); }
    catch (e) { setError((e as Error).message); }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this holiday?')) return;
    try { await deleteHoliday(id); load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div>
      <div className="ts-nav-left" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input" placeholder="Holiday name" value={name}
          onChange={(e) => setName(e.target.value)} style={{ minWidth: 200 }} />
        <button className="btn btn-primary btn-auto" onClick={add}>Add holiday</button>
      </div>
      {error && <p className="ts-error">{error}</p>}
      <table className="ts-table">
        <thead><tr><th>Date</th><th className="col-left">Name</th><th></th></tr></thead>
        <tbody>
          {holidays.length === 0 && (
            <tr><td colSpan={3} className="ts-empty">No holidays added for {year}.</td></tr>
          )}
          {holidays.map((h) => (
            <tr key={h._id}>
              <td>{h.date}</td>
              <td className="col-left">{h.name}</td>
              <td>
                <button className="table-action danger" onClick={() => remove(h._id)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
