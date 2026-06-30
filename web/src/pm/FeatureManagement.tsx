import { useEffect, useState } from 'react';
import { authed } from '../fetchHelper';

const ALL_ROLES = ['admin', 'pm', 'employee', 'reporting_manager', 'hr', 'finance', 'team_lead', 'director', 'vp'] as const;

type FeatureEntry = {
  key: string;
  label: string;
  enabled: boolean;
  roleGrants: string[];
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

  async function toggleRole(key: string, role: string, currentGrants: string[]) {
    const has = currentGrants.includes(role);
    const roleGrants = has ? currentGrants.filter(r => r !== role) : [...currentGrants, role];
    setSaving(`${key}-${role}`);
    try {
      await authed(`/features/${key}/roles`, 'PATCH', { roleGrants });
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(''); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Feature Management</h1>
          <p className="ts-sub">Control which features are visible to each role</p>
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
                  const granted = f.roleGrants.includes(role);
                  return (
                    <td key={role} style={{ textAlign: 'center' }}>
                      {f.system ? (
                        granted ? <span style={{ color: 'var(--color-success, green)' }}>●</span> : '—'
                      ) : (
                        <input
                          type="checkbox"
                          checked={granted}
                          disabled={!f.enabled || saving === `${f.key}-${role}`}
                          onChange={() => toggleRole(f.key, role, f.roleGrants)}
                        />
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
