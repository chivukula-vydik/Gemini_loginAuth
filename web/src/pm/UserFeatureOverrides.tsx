import { useEffect, useState } from 'react';
import { authed } from '../fetchHelper';
import type { FeatureAccess } from '../featureContext';

type OverrideState = {
  overrides: Record<string, string>;
  resolved: Record<string, FeatureAccess>;
};

export function UserFeatureOverrides({ userId }: { userId: string }) {
  const [state, setState] = useState<OverrideState | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  function reload() {
    authed(`/features/user-override/${userId}`).then(setState).catch(e => setError(e.message));
  }
  useEffect(() => { reload(); }, [userId]);

  async function setOverride(featureKey: string, value: 'full' | 'readonly' | 'off' | null) {
    setSaving(featureKey);
    try {
      await authed(`/features/user-override/${userId}`, 'PATCH', { featureKey, value });
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(''); }
  }

  if (!state) return null;

  const keys = Object.keys(state.resolved).sort();
  const hasOverrides = Object.keys(state.overrides).length > 0;

  function resolvedLabel(v: FeatureAccess): { text: string; color: string } {
    if (v === 'full') return { text: '● Full', color: 'var(--color-success, green)' };
    if (v === 'readonly') return { text: '◐ Read-only', color: 'orange' };
    return { text: '○ Off', color: 'var(--color-danger, red)' };
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 8 }}>Feature Overrides</h3>
      {error && <p className="ts-error">{error}</p>}
      {!hasOverrides && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>No overrides — all features follow role defaults.</p>}
      <table className="ts-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Feature</th>
            <th style={{ textAlign: 'center' }}>Status</th>
            <th style={{ textAlign: 'center' }}>Source</th>
            <th style={{ textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(key => {
            const override = state.overrides[key];
            const resolved = state.resolved[key];
            const { text, color } = resolvedLabel(resolved);
            const source = override ? `Override: ${override}` : `Inherited`;
            return (
              <tr key={key}>
                <td>{key}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color }}>{text}</span>
                </td>
                <td style={{ textAlign: 'center', fontStyle: override ? 'normal' : 'italic', fontWeight: override ? 600 : 400 }}>
                  {source}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {override ? (
                    <button className="btn btn-auto" style={{ fontSize: 11, padding: '2px 8px' }}
                      disabled={saving === key} onClick={() => setOverride(key, null)}>
                      Reset to role
                    </button>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {resolved !== 'full' && (
                        <button className="btn btn-auto" style={{ fontSize: 11, padding: '2px 8px' }}
                          disabled={saving === key} onClick={() => setOverride(key, 'full')}>
                          Grant Full
                        </button>
                      )}
                      {resolved !== 'readonly' && (
                        <button className="btn btn-auto" style={{ fontSize: 11, padding: '2px 8px' }}
                          disabled={saving === key} onClick={() => setOverride(key, 'readonly')}>
                          Set Read-only
                        </button>
                      )}
                      {resolved && (
                        <button className="btn btn-auto" style={{ fontSize: 11, padding: '2px 8px' }}
                          disabled={saving === key} onClick={() => setOverride(key, 'off')}>
                          Revoke
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
