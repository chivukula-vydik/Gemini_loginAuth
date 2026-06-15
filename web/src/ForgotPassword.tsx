import { useState } from 'react';
import { apiPost } from './api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await apiPost('/auth/local/forgot-password', { email });
    setSent(true); // always show success — no account enumeration
  }

  if (sent) return <p>If that email has an account, a reset link is on its way.</p>;
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <h2>Forgot password</h2>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Send reset link</button>
    </form>
  );
}
