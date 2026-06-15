import { AuthProvider, useAuth } from './authContext';
import { AuthLayout } from './AuthLayout';
import { LoginWidget } from './LoginWidget';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

function Home() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <p className="center-loading">Loading…</p>;
  if (user) {
    const display = user.displayName || user.email;
    return (
      <div className="welcome">
        <div className="avatar">{initials(display)}</div>
        <h1>Welcome, {display}</h1>
        <p className="email">{user.email}</p>
        <div className="chips">
          {user.providers.map((p) => (
            <span key={p.provider} className="chip">{p.provider}</span>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
      </div>
    );
  }
  return <LoginWidget />;
}

export default function App() {
  const path = window.location.pathname;
  let content;
  if (path === '/forgot') content = <ForgotPassword />;
  else if (path === '/reset') content = <ResetPassword />;
  else content = (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );

  return <AuthLayout>{content}</AuthLayout>;
}
