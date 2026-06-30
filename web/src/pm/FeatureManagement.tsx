import { useEffect, useState } from 'react';
import { authed } from '../fetchHelper';
import { listRoles, createRole, updateRole, deleteRole, type RoleDef } from './pmApi';

type FeatureEntry = {
  key: string;
  label: string;
  enabled: boolean;
  roleGrants: string[];
  readonlyRoles: string[];
  system: boolean;
};

export function FeatureManagement() {
  const [features, setFeatures] = useState<FeatureEntry[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [newRole, setNewRole] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  function reload() {
    authed('/features').then(setFeatures).catch(e => setError(e.message));
    listRoles().then(setRoles).catch(e => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function toggleGlobal(key: string, enabled: boolean) {
    setSaving(key);
    try {
      await authed(`/features/${key}/toggle`, 'PATCH', { enabled });
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(''); }
  }

  async function toggleRole(key: string, role: string, currentGrants: string[], currentReadonly: string[]) {
    const hasFull = currentGrants.includes(role);
    const hasRO = currentReadonly.includes(role);
    let roleGrants = currentGrants;
    let readonlyRoles = currentReadonly;
    if (!hasFull && !hasRO) {
      roleGrants = [...currentGrants, role];
    } else if (hasFull) {
      roleGrants = currentGrants.filter(r => r !== role);
      readonlyRoles = [...currentReadonly, role];
    } else {
      readonlyRoles = currentReadonly.filter(r => r !== role);
    }
    setSaving(`${key}-${role}`);
    try {
      await authed(`/features/${key}/roles`, 'PATCH', { roleGrants, readonlyRoles });
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(''); }
  }

  async function handleAddRole() {
    if (!newRole.trim()) return;
    setAddingRole(true);
    try {
      await createRole(newRole.trim());
      setNewRole('');
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setAddingRole(false); }
  }

  async function handleRenameRole(id: string) {
    if (!editLabel.trim()) return;
    try {
      await updateRole(id, { label: editLabel.trim() });
      setEditingRole(null);
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function handleDeleteRole(r: RoleDef) {
    if (!confirm(`Delete role "${r.label}"? Users with this role will keep it until reassigned.`)) return;
    try {
      await deleteRole(r._id);
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  function accessLabel(f: FeatureEntry, role: string): { text: string; color: string } {
    if (f.roleGrants.includes(role)) return { text: 'Full', color: 'var(--color-success, green)' };
    if (f.readonlyRoles.includes(role)) return { text: 'RO', color: 'orange' };
    return { text: '—', color: 'var(--text-muted, #999)' };
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Feature Management</h1>
          <p className="ts-sub">Control which features are visible to each role. Click a cell to cycle: Full → Read-only → Off. Double-click a role header to rename.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="ts-input"
            placeholder="New role name…"
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddRole()}
            style={{ width: 160 }}
          />
          <button className="btn btn-primary" disabled={addingRole || !newRole.trim()} onClick={handleAddRole}>
            + Role
          </button>
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card" style={{ overflowX: 'auto' }}>
        <table className="ts-table" style={{ minWidth: 800 }}>
          <thead>
            <tr>
              <th className="ts-task">Feature</th>
              <th style={{ textAlign: 'center', width: 80 }}>Global</th>
              {roles.map(r => (
                <th key={r.name} style={{ textAlign: 'center', fontSize: 11, width: 80, position: 'relative' }}>
                  {editingRole === r._id ? (
                    <input
                      className="ts-input"
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onBlur={() => handleRenameRole(r._id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameRole(r._id); if (e.key === 'Escape') setEditingRole(null); }}
                      autoFocus
                      style={{ width: 70, fontSize: 11, padding: '1px 4px', textAlign: 'center' }}
                    />
                  ) : (
                    <span
                      style={{ cursor: 'pointer' }}
                      onDoubleClick={() => { setEditingRole(r._id); setEditLabel(r.label); }}
                      title={r.builtIn ? `Built-in role (${r.name}) — double-click to rename` : `Custom role (${r.name}) — double-click to rename`}
                    >
                      {r.label}
                      <span
                        onClick={(e) => { e.stopPropagation(); handleDeleteRole(r); }}
                        style={{ marginLeft: 2, cursor: 'pointer', color: 'var(--text-muted, #999)', fontSize: 9 }}
                        title="Delete role"
                      >✕</span>
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map(f => (
              <tr key={f.key} style={{ opacity: f.enabled ? 1 : 0.5 }}>
                <td className="ts-task">{f.label}</td>
                <td style={{ textAlign: 'center' }}>
                  {f.system ? (
                    <span title="System feature — cannot be disabled" style={{ cursor: 'not-allowed' }}>🔒</span>
                  ) : (
                    <button
                      className={`btn btn-auto ${f.enabled ? 'btn-primary' : ''}`}
                      style={{ minWidth: 44, padding: '2px 8px', fontSize: 12 }}
                      disabled={saving === f.key}
                      onClick={() => toggleGlobal(f.key, !f.enabled)}
                    >
                      {f.enabled ? 'ON' : 'OFF'}
                    </button>
                  )}
                </td>
                {roles.map(({ name: role }) => {
                  const { text, color } = accessLabel(f, role);
                  return (
                    <td key={role} style={{ textAlign: 'center' }}>
                      {f.system ? (
                        f.roleGrants.includes(role) ? <span style={{ color: 'var(--color-success, green)' }}>●</span> : '—'
                      ) : (
                        <button
                          className="btn btn-auto"
                          style={{ minWidth: 40, padding: '2px 6px', fontSize: 11, color, fontWeight: 600 }}
                          disabled={!f.enabled || saving === `${f.key}-${role}`}
                          onClick={() => toggleRole(f.key, role, f.roleGrants, f.readonlyRoles)}
                        >
                          {text}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
