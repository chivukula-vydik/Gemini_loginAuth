import { useEffect, useState } from 'react';
import { fetchProviders, apiPost, oauthUrl, setAccessToken, Provider } from './api';
import { useAuth } from './authContext';

type Mode = 'login' | 'register';

export function LoginWidget() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { reload } = useAuth();

  useEffect(() => { fetchProviders().then(setProviders); }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
  }

  async function submitLocal(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      const path = mode === 'register' ? '/auth/local/register' : '/auth/local/login';
      const body =
        mode === 'register'
          ? { email, password, displayName: name }
          : { email, password };
      const { accessToken } = await apiPost(path, body);
      setAccessToken(accessToken);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const local = providers.find((p) => p.kind === 'password');
  const redirects = providers.filter((p) => p.kind !== 'password');
  const registering = mode === 'register';

  return (
    <>
      <h1 className="auth-title">{registering ? 'Create your account' : 'Welcome back'}</h1>
      <p className="auth-subtitle">
        {registering ? 'Sign up to get started.' : 'Sign in to continue to your account.'}
      </p>

      {error && <div className="alert">{error}</div>}

      {local && (
        <form onSubmit={submitLocal}>
          {registering && (
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                className="input"
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={registering ? 'new-password' : 'current-password'}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy
              ? registering ? 'Creating account…' : 'Signing in…'
              : registering ? 'Create account' : 'Sign in'}
          </button>
          {!registering && (
            <div className="form-foot">
              <a className="link" href="/forgot">Forgot password?</a>
            </div>
          )}
        </form>
      )}

      {local && (
        <p className="switch-line">
          {registering ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => switchMode(registering ? 'login' : 'register')}
          >
            {registering ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      )}

      {local && redirects.length > 0 && <div className="divider">or</div>}

      {redirects.length > 0 && (
        <div className="providers">
          {redirects.map((p) => (
            <a key={p.id} href={oauthUrl(p.startUrl!)}>
              <button type="button" className="btn btn-provider">
                Continue with {p.displayName}
              </button>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
