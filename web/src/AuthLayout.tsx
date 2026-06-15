import { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="logo">A</span>
          <span className="name">Auth Service</span>
        </div>
        {children}
      </div>
    </div>
  );
}
