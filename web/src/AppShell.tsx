import { useAuth } from './authContext';
import { TimesheetPage } from './timesheet/TimesheetPage';

export function AppShell() {
  const { user, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand"><span className="logo">A</span><span className="name">Auth Service</span></div>
        <nav className="shell-nav">
          <a className="shell-nav-item active" href="#">Timesheet</a>
        </nav>
        <div className="shell-user">
          <div className="shell-user-email">{user?.email}</div>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="shell-content">
        <TimesheetPage />
      </main>
    </div>
  );
}
