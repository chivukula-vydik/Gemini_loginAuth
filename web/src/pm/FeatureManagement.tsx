import { useEffect, useState } from 'react';
import { authed } from '../fetchHelper';

const ALL_ROLES = ['admin', 'pm', 'employee', 'reporting_manager', 'hr', 'finance', 'team_lead', 'director', 'vp'] as const;

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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  function reload() {
    authed('/features').then(setFeatures).catch(e => setError(e.message));
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
    // cycle: off → full → readonly → off
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
          <p className="ts-sub">Control which features are visible to each role. Click a cell to cycle: Full → Read-only → Off</p>
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card" style={{ overflowX: 'auto' }}>
        <table className="ts-table" style={{ minWidth: 800 }}>
          <thead>
            <tr>
              <th className="ts-task">Feature</th>
              <th style={{ textAlign: 'center', width: 80 }}>Global</th>
              {ALL_ROLES.map(r => (
                <th key={r} style={{ textAlign: 'center', fontSize: 11, width: 70 }}>
                  {r.replace('_', ' ')}
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
                {ALL_ROLES.map(role => {
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
