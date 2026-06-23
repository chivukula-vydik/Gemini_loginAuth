import { useEffect, useState } from 'react';
import { listUrlCategories, createUrlCategory, deleteUrlCategory, UrlCategoryRule } from './urlTrackingApi';

export function UrlCategories() {
  const [rules, setRules] = useState<UrlCategoryRule[]>([]);
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState<'productive' | 'neutral' | 'non-productive'>('productive');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  function reload() { listUrlCategories().then(setRules).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!pattern.trim()) return;
    setError('');
    try {
      await createUrlCategory({ pattern: pattern.trim(), category, label: label.trim() });
      setPattern(''); setLabel(''); reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function remove(id: string) {
    setError('');
    try { await deleteUrlCategory(id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">URL Categories</h1>
          <p className="ts-sub">Define rules to auto-categorize tracked URLs</p>
        </div>
      </header>

      <div className="ts-card card-section">
        <div className="card-title">Add Rule</div>
        <div className="ts-nav-left" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" placeholder="Domain pattern (e.g. github.com)" value={pattern}
            onChange={(e) => setPattern(e.target.value)} />
          <select className="input pm-select" value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="productive">Productive</option>
            <option value="neutral">Neutral</option>
            <option value="non-productive">Non-Productive</option>
          </select>
          <input className="input" placeholder="Label (optional)" value={label}
            onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-auto btn-primary" onClick={add}>Add</button>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Pattern</th><th className="col-left">Category</th><th className="col-left">Label</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={4} className="ts-empty">No rules defined.</td></tr>}
            {rules.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{r.pattern}</td>
                <td className="col-left">{r.category}</td>
                <td className="col-left">{r.label || '—'}</td>
                <td className="col-left">
                  <button className="table-action danger" onClick={() => remove(r._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
