import { useEffect, useState } from 'react';
import { authed } from '../fetchHelper';

const ENTITY_TYPES = ['reimbursement', 'leave', 'payrollRun'] as const;
const APPROVER_TYPES = ['user', 'role', 'manager'] as const;
const RULES = ['any', 'all'] as const;
const ROLES = ['admin', 'pm', 'employee', 'reporting_manager', 'hr', 'finance', 'team_lead', 'director', 'vp'];
const CONDITION_OPS = ['gt', 'gte', 'lt', 'lte', 'eq'] as const;

type Step = { order: number; name: string; approverType: string; approvers: string[]; rule: string };
type Condition = { field: string; op: string; value: string | number } | null;
type Flow = {
  _id: string;
  name: string;
  appliesTo: { entityType: string; condition?: Condition };
  steps: Step[];
  priority: number;
  active: boolean;
};

const emptyStep = (): Step => ({ order: 1, name: '', approverType: 'manager', approvers: [], rule: 'any' });

export function ApprovalFlowBuilder() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [editing, setEditing] = useState<Flow | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    authed('/approval-flows').then(setFlows).catch(e => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  function startNew() {
    setEditing({
      _id: '',
      name: '',
      appliesTo: { entityType: 'reimbursement' },
      steps: [emptyStep()],
      priority: 0,
      active: true,
    });
  }

  function startEdit(f: Flow) {
    setEditing({ ...f, steps: f.steps.map(s => ({ ...s })) });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        name: editing.name,
        appliesTo: editing.appliesTo,
        steps: editing.steps,
        priority: editing.priority,
        active: editing.active,
      };
      if (editing._id) {
        await authed(`/approval-flows/${editing._id}`, 'PUT', body);
      } else {
        await authed('/approval-flows', 'POST', body);
      }
      setEditing(null);
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function toggleActive(f: Flow) {
    await authed(`/approval-flows/${f._id}/toggle`, 'PATCH');
    reload();
  }

  async function duplicate(f: Flow) {
    await authed(`/approval-flows/${f._id}/duplicate`, 'POST');
    reload();
  }

  async function remove(f: Flow) {
    if (!window.confirm(`Delete "${f.name}"?`)) return;
    try {
      await authed(`/approval-flows/${f._id}`, 'DELETE');
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  // Step helpers
  function updateStep(idx: number, patch: Partial<Step>) {
    if (!editing) return;
    const steps = [...editing.steps];
    steps[idx] = { ...steps[idx], ...patch };
    setEditing({ ...editing, steps });
  }

  function addStep() {
    if (!editing) return;
    const order = editing.steps.length + 1;
    setEditing({ ...editing, steps: [...editing.steps, { ...emptyStep(), order }] });
  }

  function removeStep(idx: number) {
    if (!editing) return;
    const steps = editing.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
    setEditing({ ...editing, steps });
  }

  function moveStep(idx: number, dir: -1 | 1) {
    if (!editing) return;
    const steps = [...editing.steps];
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[idx], steps[target]] = [steps[target], steps[idx]];
    const reordered = steps.map((s, i) => ({ ...s, order: i + 1 }));
    setEditing({ ...editing, steps: reordered });
  }

  // Condition helpers
  function setCondition(c: Condition) {
    if (!editing) return;
    setEditing({ ...editing, appliesTo: { ...editing.appliesTo, condition: c } });
  }

  if (editing) {
    return (
      <div className="ts-page">
        <header className="ts-header">
          <h1 className="ts-h1">{editing._id ? 'Edit Flow' : 'New Flow'}</h1>
          <div className="ts-nav-left">
            <button className="btn btn-auto" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-auto btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </header>
        {error && <p className="ts-error">{error}</p>}

        <div className="ts-card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
            <label>
              Name
              <input className="input" value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label>
              Entity Type
              <select className="input" value={editing.appliesTo.entityType}
                onChange={e => setEditing({ ...editing, appliesTo: { ...editing.appliesTo, entityType: e.target.value } })}>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              Priority (lower = higher priority)
              <input className="input" type="number" value={editing.priority}
                onChange={e => setEditing({ ...editing, priority: Number(e.target.value) })} />
            </label>

            {/* Condition */}
            <fieldset style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 6 }}>
              <legend>Condition (optional)</legend>
              {editing.appliesTo.condition ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="input" placeholder="field" style={{ width: 120 }}
                    value={editing.appliesTo.condition.field}
                    onChange={e => setCondition({ ...editing.appliesTo.condition!, field: e.target.value })} />
                  <select className="input" style={{ width: 80 }}
                    value={editing.appliesTo.condition.op}
                    onChange={e => setCondition({ ...editing.appliesTo.condition!, op: e.target.value })}>
                    {CONDITION_OPS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input className="input" placeholder="value" style={{ width: 120 }}
                    value={editing.appliesTo.condition.value}
                    onChange={e => setCondition({ ...editing.appliesTo.condition!, value: e.target.value })} />
                  <button className="btn btn-auto" onClick={() => setCondition(null)}>Remove</button>
                </div>
              ) : (
                <button className="btn btn-auto" onClick={() => setCondition({ field: '', op: 'gt', value: '' })}>
                  Add condition
                </button>
              )}
            </fieldset>
          </div>

          {/* Steps */}
          <h3 style={{ marginTop: 20, marginBottom: 8 }}>Steps</h3>
          {editing.steps.map((step, idx) => (
            <div key={idx} style={{
              border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginBottom: 8,
              display: 'grid', gap: 8, gridTemplateColumns: '1fr',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, minWidth: 30 }}>#{step.order}</span>
                <input className="input" placeholder="Step name" value={step.name}
                  onChange={e => updateStep(idx, { name: e.target.value })} style={{ flex: 1 }} />
                <select className="input" value={step.approverType} style={{ width: 110 }}
                  onChange={e => updateStep(idx, { approverType: e.target.value, approvers: [] })}>
                  {APPROVER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="input" value={step.rule} style={{ width: 80 }}
                  onChange={e => updateStep(idx, { rule: e.target.value })}>
                  {RULES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn btn-auto" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                  title="Move up" style={{ padding: '2px 6px' }}>↑</button>
                <button className="btn btn-auto" onClick={() => moveStep(idx, 1)}
                  disabled={idx === editing.steps.length - 1} title="Move down" style={{ padding: '2px 6px' }}>↓</button>
                <button className="btn btn-auto" onClick={() => removeStep(idx)}
                  disabled={editing.steps.length <= 1} title="Remove step" style={{ padding: '2px 6px', color: 'var(--color-danger, red)' }}>×</button>
              </div>
              {step.approverType === 'role' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 38 }}>
                  {ROLES.map(r => (
                    <label key={r} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <input type="checkbox" checked={step.approvers.includes(r)}
                        onChange={e => {
                          const approvers = e.target.checked
                            ? [...step.approvers, r]
                            : step.approvers.filter(a => a !== r);
                          updateStep(idx, { approvers });
                        }} />
                      {r.replace('_', ' ')}
                    </label>
                  ))}
                </div>
              )}
              {step.approverType === 'user' && (
                <div style={{ paddingLeft: 38 }}>
                  <input className="input" placeholder="Comma-separated user IDs"
                    value={step.approvers.join(', ')}
                    onChange={e => updateStep(idx, { approvers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                </div>
              )}
              {step.approverType === 'manager' && (
                <p style={{ paddingLeft: 38, fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Resolved to requester's reporting manager at request time.
                </p>
              )}
            </div>
          ))}
          <button className="btn btn-auto" onClick={addStep}>+ Add Step</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Approval Flows</h1>
          <p className="ts-sub">{flows.length} flow{flows.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn-auto btn-primary" onClick={startNew}>New Flow</button>
      </header>

      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Name</th>
              <th>Entity</th>
              <th>Steps</th>
              <th style={{ textAlign: 'center' }}>Priority</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {flows.length === 0 && <tr><td colSpan={6} className="ts-empty">No flows yet.</td></tr>}
            {flows.map(f => (
              <tr key={f._id} style={{ opacity: f.active ? 1 : 0.5 }}>
                <td className="ts-task">{f.name}</td>
                <td>{f.appliesTo.entityType}</td>
                <td>{f.steps.length} step{f.steps.length === 1 ? '' : 's'}</td>
                <td style={{ textAlign: 'center' }}>{f.priority}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`status-badge ${f.active ? 'status-done' : 'status-archived'}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {f.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-auto" style={{ fontSize: 12, padding: '2px 8px' }}
                      onClick={() => startEdit(f)}>Edit</button>
                    <button className="btn btn-auto" style={{ fontSize: 12, padding: '2px 8px' }}
                      onClick={() => toggleActive(f)}>{f.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-auto" style={{ fontSize: 12, padding: '2px 8px' }}
                      onClick={() => duplicate(f)}>Duplicate</button>
                    <button className="btn btn-auto" style={{ fontSize: 12, padding: '2px 8px', color: 'var(--color-danger, red)' }}
                      onClick={() => remove(f)}>Delete</button>
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
