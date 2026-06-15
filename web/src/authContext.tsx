import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchMe, refresh, setAccessToken, logout as apiLogout } from './api';

type User = { email: string; displayName: string; providers: { provider: string }[] };
type AuthState = { user: User | null; loading: boolean; reload: () => Promise<void>; signOut: () => Promise<void> };

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    // Pick up an access token left in the URL fragment by OAuth/SAML callbacks.
    const frag = new URLSearchParams(window.location.hash.slice(1));
    const fromFragment = frag.get('access_token');
    if (fromFragment) {
      setAccessToken(fromFragment);
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      const t = await refresh();
      if (t) setAccessToken(t);
    }
    setUser(await fetchMe());
    setLoading(false);
  }

  async function signOut() {
    await apiLogout();
    setUser(null);
  }

  useEffect(() => { reload(); }, []);

  return <Ctx.Provider value={{ user, loading, reload, signOut }}>{children}</Ctx.Provider>;
}
