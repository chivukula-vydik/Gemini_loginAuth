import { createContext, useContext, useEffect, useState, ReactNode, useCallback, CSSProperties } from 'react';
import { authed } from './fetchHelper';

export type FeatureAccess = 'full' | 'readonly' | false;
type FeatureFlags = Record<string, FeatureAccess>;
type FeatureState = { features: FeatureFlags; loading: boolean; reload: () => Promise<void> };

const Ctx = createContext<FeatureState>({ features: {}, loading: true, reload: async () => {} });
export const useFeatures = () => useContext(Ctx);
export const useFeatureAccess = (key: string): FeatureAccess => useContext(Ctx).features[key] ?? false;

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<FeatureFlags>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await authed('/features/my-features');
      setFeatures(data);
    } catch {
      // fallback: empty = nothing gated
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const handler = () => reload();
    window.addEventListener('feature-disabled', handler);
    return () => window.removeEventListener('feature-disabled', handler);
  }, [reload]);

  return <Ctx.Provider value={{ features, loading, reload }}>{children}</Ctx.Provider>;
}

const roStyle: CSSProperties = { position: 'relative', pointerEvents: 'none', opacity: 0.7 };
const roBanner: CSSProperties = { pointerEvents: 'auto', position: 'sticky', top: 0, zIndex: 50, padding: '6px 16px', background: 'var(--warning-bg, #fff3cd)', color: 'var(--warning-fg, #856404)', fontSize: 13, fontWeight: 600, textAlign: 'center', borderBottom: '1px solid var(--warning-border, #ffc107)' };

export function ReadonlyGuard({ featureKey, children }: { featureKey: string; children: ReactNode }) {
  const access = useFeatureAccess(featureKey);
  if (access === 'full') return <>{children}</>;
  if (!access) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>You do not have access to this feature.</div>;
  return (
    <div style={roStyle}>
      <div style={roBanner}>Read-only — you can view but not edit</div>
      <div>{children}</div>
    </div>
  );
}
