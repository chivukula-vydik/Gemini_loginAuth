import { useState } from 'react';
import { apiPost } from './api';

export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiPost('/auth/local/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (done) return <p>Password updated. <a href="/">Sign in</a>.</p>;
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <h2>Choose a new password</h2>
      <input placeholder="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Reset password</button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </form>
  );
}
