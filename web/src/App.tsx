import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './authContext';
import { AuthLayout } from './AuthLayout';
import { AppShell } from './AppShell';
import { LoginWidget } from './LoginWidget';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { CandidatePortal } from './onboarding/CandidatePortal';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLayout><p className="center-loading">Loading…</p></AuthLayout>;
  if (user) return <AppShell />;
  return <AuthLayout><LoginWidget /></AuthLayout>;
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/forgot') return <AuthLayout><ForgotPassword /></AuthLayout>;
  if (path === '/reset') return <AuthLayout><ResetPassword /></AuthLayout>;
  if (path.startsWith('/portal/')) return <Routes><Route path="/portal/:token" element={<CandidatePortal />} /></Routes>;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
