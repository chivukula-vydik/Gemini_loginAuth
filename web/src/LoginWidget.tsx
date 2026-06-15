import { useEffect, useState } from 'react';
import { fetchProviders, apiPost, oauthUrl, setAccessToken, Provider } from './api';
import { useAuth } from './authContext';

export function LoginWidget() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { reload } = useAuth();

  useEffect(() => { fetchProviders().then(setProviders); }, []);

  async function submitLocal(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { accessToken } = await apiPost('/auth/local/login', { email, password });
      setAccessToken(accessToken);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const local = providers.find((p) => p.kind === 'password');
  const redirects = providers.filter((p) => p.kind !== 'password');

  return (
    <div style={{ maxWidth: 320, display: 'grid', gap: 12 }}>
      {local && (
        <form onSubmit={submitLocal} style={{ display: 'grid', gap: 8 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit">Sign in</button>
          <a href="/forgot">Forgot password?</a>
        </form>
      )}
      {redirects.map((p) => (
        <a key={p.id} href={oauthUrl(p.startUrl!)}>
          <button type="button">Continue with {p.displayName}</button>
        </a>
      ))}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}
