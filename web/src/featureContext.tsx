import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authed } from './fetchHelper';

type FeatureFlags = Record<string, boolean>;
type FeatureState = { features: FeatureFlags; loading: boolean; reload: () => Promise<void> };

const Ctx = createContext<FeatureState>({ features: {}, loading: true, reload: async () => {} });
export const useFeatures = () => useContext(Ctx);

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
