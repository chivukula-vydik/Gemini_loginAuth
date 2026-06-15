import { AuthProvider, useAuth } from './authContext';
import { LoginWidget } from './LoginWidget';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';

function Home() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (user) {
    return (
      <div>
        <h1>Welcome, {user.displayName || user.email}</h1>
        <p>Linked: {user.providers.map((p) => p.provider).join(', ')}</p>
        <button onClick={signOut}>Sign out</button>
      </div>
    );
  }
  return <LoginWidget />;
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/forgot') return <ForgotPassword />;
  if (path === '/reset') return <ResetPassword />;
  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}
