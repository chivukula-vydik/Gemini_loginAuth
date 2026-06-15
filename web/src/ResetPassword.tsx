import { useState } from 'react';
import { apiPost } from './api';

export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiPost('/auth/local/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <h1 className="auth-title">Password updated</h1>
        <p className="notice">You can now sign in with your new password.</p>
        <div className="form-foot" style={{ marginTop: 18 }}>
          <a className="link" href="/">Go to sign in</a>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="auth-title">Choose a new password</h1>
      <p className="auth-subtitle">Enter a new password for your account.</p>

      {error && <div className="alert">{error}</div>}

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Updating…' : 'Reset password'}
        </button>
      </form>
    </>
  );
}
