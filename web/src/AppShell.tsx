import { useState, type ReactElement } from 'react';
import { useAuth } from './authContext';
import { TimesheetPage } from './timesheet/TimesheetPage';
import { AttendancePage } from './attendance/AttendancePage';
import { navForRole, NavKey } from './pm/nav';
import { AdminUsers } from './pm/AdminUsers';
import { AdminSkills } from './pm/AdminSkills';
import { CompanyFit } from './pm/CompanyFit';
import { Projects } from './pm/Projects';
import { MyTasks } from './pm/MyTasks';
import { MySkills } from './pm/MySkills';
import { Requests } from './pm/Requests';
import { Marketplace } from './pm/Marketplace';
import { Utilization } from './pm/Utilization';
import { HomePage } from './dashboard/HomePage';
import { ThemeToggle } from './ThemeToggle';
import { personName } from './pm/personName';

function viewFor(key: NavKey, setActive: (key: NavKey) => void) {
  switch (key) {
    case 'home': return <HomePage onNavigate={setActive} />;
    case 'users': return <AdminUsers />;
    case 'skills': return <AdminSkills />;
    case 'company-fit': return <CompanyFit />;
    case 'projects': return <Projects />;
    case 'requests': return <Requests />;
    case 'my-tasks': return <MyTasks />;
    case 'my-skills': return <MySkills />;
    case 'marketplace': return <Marketplace />;
    case 'timesheet': return <TimesheetPage />;
    case 'attendance': return <AttendancePage />;
    case 'utilization': return <Utilization />;
  }
}

const NAV_ICONS: Record<NavKey, ReactElement> = {
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />,
  users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  skills: <path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 21l2.3-7.1-6-4.5h7.6z" />,
  'company-fit': <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3M9 11l3 3L22 4" />,
  projects: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  requests: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />,
  marketplace: <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />,
  'my-tasks': <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  'my-skills': <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  timesheet: <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  attendance: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11l-4 4-2-2" />,
  utilization: <path d="M18 20V10M12 20V4M6 20v-6" />,
};

function NavIcon({ name }: { name: NavKey }) {
  return (
    <svg className="shell-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[name]}
    </svg>
  );
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const items = navForRole(user?.role ?? 'employee');
  const [active, setActive] = useState<NavKey>('home');
  const name = personName(user);
  const initial = (name[0] ?? '?').toUpperCase();

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand"><span className="logo">A</span><span className="name">Auth Service</span></div>
        <nav className="shell-nav">
          {items.map((it) => (
            <a key={it.key} className={`shell-nav-item${active === it.key ? ' active' : ''}`}
              href="#" onClick={(e) => { e.preventDefault(); setActive(it.key); }}>
              <NavIcon name={it.key} />
              <span>{it.label}</span>
            </a>
          ))}
        </nav>
        <div className="shell-foot">
          <ThemeToggle />
          <div className="shell-user">
            <div className="shell-avatar">{initial}</div>
            <div className="shell-user-meta">
              <div className="shell-user-email">{name}</div>
              {user?.role && <div className="shell-user-role">{user.role}</div>}
            </div>
            <button className="shell-signout" onClick={signOut} title="Sign out" aria-label="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main className="shell-content">
        {viewFor(active, setActive)}
      </main>
    </div>
  );
}
