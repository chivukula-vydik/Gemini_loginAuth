import { useState } from 'react';
import { apiPost } from './api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost('/auth/local/forgot-password', { email });
      setSent(true); // always show success — no account enumeration
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <h1 className="auth-title">Check your inbox</h1>
        <p className="notice">
          If that email has an account, a reset link is on its way.
        </p>
        <div className="form-foot" style={{ marginTop: 18 }}>
          <a className="link" href="/">Back to sign in</a>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="auth-title">Forgot password</h1>
      <p className="auth-subtitle">We'll email you a link to reset it.</p>
      <form onSubmit={submit}>
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
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
        <div className="form-foot">
          <a className="link" href="/">Back to sign in</a>
        </div>
      </form>
    </>
  );
}
