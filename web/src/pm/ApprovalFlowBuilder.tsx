import { useEffect, useState } from 'react';
import { authed } from '../fetchHelper';

const ENTITY_TYPES = ['reimbursement', 'leave', 'payrollRun'] as const;
const APPROVER_TYPES = [
  { value: 'manager', label: 'Reporting Manager', desc: 'Requester\'s direct manager' },
  { value: 'project_manager', label: 'Project Manager', desc: 'PM of the linked project' },
  { value: 'team_lead', label: 'Team Lead', desc: 'Team lead in requester\'s department' },
  { value: 'hr', label: 'HR', desc: 'HR in requester\'s department' },
  { value: 'director', label: 'Director', desc: 'Director in requester\'s department' },
  { value: 'vp', label: 'VP', desc: 'VP in requester\'s department' },
  { value: 'role', label: 'Anyone with Role', desc: 'Pick which roles can approve' },
  { value: 'user', label: 'Specific Users', desc: 'Enter user IDs' },
] as const;
const RULES = ['any', 'all'] as const;
const ROLES = ['admin', 'pm', 'employee', 'reporting_manager', 'hr', 'finance', 'team_lead', 'director', 'vp'];

// Known condition fields per entity type for friendly dropdowns
const CONDITION_FIELDS: Record<string, { value: string; label: string; type: 'number' | 'string' }[]> = {
  reimbursement: [
    { value: 'amount', label: 'Amount', type: 'number' },
    { value: 'category', label: 'Category', type: 'string' },
  ],
  leave: [
    { value: 'requestedDays', label: 'Days Requested', type: 'number' },
    { value: 'type', label: 'Leave Type', type: 'string' },
  ],
  payrollRun: [],
};
const CONDITION_OPS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
];

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

  function setCondition(c: Condition) {
    if (!editing) return;
    setEditing({ ...editing, appliesTo: { ...editing.appliesTo, condition: c } });
  }

  const entityFields = editing ? (CONDITION_FIELDS[editing.appliesTo.entityType] || []) : [];

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
          {/* Basic info */}
          <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Flow Name</span>
              <input className="input" placeholder="e.g. High-value Reimbursement Approval" value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Applies To</span>
                <select className="input" value={editing.appliesTo.entityType}
                  onChange={e => {
                    setEditing({ ...editing, appliesTo: { entityType: e.target.value } });
                  }}>
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t === 'payrollRun' ? 'Payroll Run' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </label>
              <label style={{ width: 100 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Priority</span>
                <input className="input" type="number" value={editing.priority}
                  onChange={e => setEditing({ ...editing, priority: Number(e.target.value) })} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lower = checked first</span>
              </label>
            </div>
          </div>

          {/* Condition */}
          <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 6, maxWidth: 500 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              When should this flow apply?
            </div>
            {editing.appliesTo.condition ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>If</span>
                {entityFields.length > 0 ? (
                  <select className="input" style={{ width: 140 }}
                    value={editing.appliesTo.condition.field}
                    onChange={e => setCondition({ ...editing.appliesTo.condition!, field: e.target.value })}>
                    <option value="">Select field...</option>
                    {entityFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                ) : (
                  <input className="input" placeholder="field name" style={{ width: 120 }}
                    value={editing.appliesTo.condition.field}
                    onChange={e => setCondition({ ...editing.appliesTo.condition!, field: e.target.value })} />
                )}
                <select className="input" style={{ width: 60 }}
                  value={editing.appliesTo.condition.op}
                  onChange={e => setCondition({ ...editing.appliesTo.condition!, op: e.target.value })}>
                  {CONDITION_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input className="input" placeholder="value" style={{ width: 100 }}
                  value={editing.appliesTo.condition.value}
                  onChange={e => setCondition({ ...editing.appliesTo.condition!, value: e.target.value })} />
                <button className="btn btn-auto" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setCondition(null)}>Remove</button>
              </div>
            ) : (
              <div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Always (no condition). </span>
                {entityFields.length > 0 && (
                  <button className="btn btn-auto" style={{ fontSize: 12, padding: '2px 8px' }}
                    onClick={() => setCondition({ field: entityFields[0].value, op: 'gt', value: '' })}>
                    Add condition
                  </button>
                )}
                {entityFields.length === 0 && (
                  <button className="btn btn-auto" style={{ fontSize: 12, padding: '2px 8px' }}
                    onClick={() => setCondition({ field: '', op: 'gt', value: '' })}>
                    Add condition
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Steps */}
          <h3 style={{ marginTop: 24, marginBottom: 4 }}>Approval Steps</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Steps run in order. Each step must be approved before the next one starts.
          </p>

          {editing.steps.map((step, idx) => {
            const typeInfo = APPROVER_TYPES.find(t => t.value === step.approverType);
            return (
              <div key={idx} style={{
                border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginBottom: 8,
                background: 'var(--bg-offset, #fafafa)',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-muted)', minWidth: 28 }}>{step.order}</span>
                  <input className="input" placeholder="Step name, e.g. Manager Review" value={step.name}
                    onChange={e => updateStep(idx, { name: e.target.value })} style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="btn btn-auto" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                      title="Move up" style={{ padding: '4px 8px', fontSize: 14 }}>↑</button>
                    <button className="btn btn-auto" onClick={() => moveStep(idx, 1)}
                      disabled={idx === editing.steps.length - 1} title="Move down" style={{ padding: '4px 8px', fontSize: 14 }}>↓</button>
                    <button className="btn btn-auto" onClick={() => removeStep(idx)}
                      disabled={editing.steps.length <= 1} title="Remove" style={{ padding: '4px 8px', fontSize: 14, color: 'var(--color-danger, red)' }}>×</button>
                  </div>
                </div>

                <div style={{ paddingLeft: 36 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 90 }}>Who approves:</span>
                    <select className="input" value={step.approverType} style={{ width: 180 }}
                      onChange={e => updateStep(idx, { approverType: e.target.value, approvers: [] })}>
                      {APPROVER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {step.approverType === 'role' && (
                      <>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>needs</span>
                        <select className="input" value={step.rule} style={{ width: 100 }}
                          onChange={e => updateStep(idx, { rule: e.target.value })}>
                          <option value="any">Any one</option>
                          <option value="all">All of them</option>
                        </select>
                      </>
                    )}
                  </div>

                  {typeInfo && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>{typeInfo.desc}</p>
                  )}

                  {step.approverType === 'role' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {ROLES.map(r => (
                        <label key={r} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
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
                    <input className="input" placeholder="Comma-separated user IDs"
                      value={step.approvers.join(', ')}
                      onChange={e => updateStep(idx, { approvers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                  )}
                </div>
              </div>
            );
          })}
          <button className="btn btn-auto" onClick={addStep} style={{ marginTop: 4 }}>+ Add Step</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Approval Flows</h1>
          <p className="ts-sub">{flows.length} flow{flows.length === 1 ? '' : 's'} — define who approves what, in what order</p>
        </div>
        <button className="btn btn-auto btn-primary" onClick={startNew}>New Flow</button>
      </header>

      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Name</th>
              <th>Type</th>
              <th>Condition</th>
              <th>Steps</th>
              <th style={{ textAlign: 'center' }}>Priority</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {flows.length === 0 && <tr><td colSpan={7} className="ts-empty">No flows yet.</td></tr>}
            {flows.map(f => (
              <tr key={f._id} style={{ opacity: f.active ? 1 : 0.5 }}>
                <td className="ts-task">{f.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{f.appliesTo.entityType}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {f.appliesTo.condition
                    ? `${f.appliesTo.condition.field} ${f.appliesTo.condition.op} ${f.appliesTo.condition.value}`
                    : 'Always'}
                </td>
                <td>
                  {f.steps.map((s, i) => (
                    <span key={i} style={{ fontSize: 12 }}>
                      {i > 0 && ' → '}{s.name || `Step ${s.order}`}
                    </span>
                  ))}
                </td>
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
