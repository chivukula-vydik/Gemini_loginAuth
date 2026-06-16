import { useState } from 'react';
import { useAuth } from './authContext';
import { TimesheetPage } from './timesheet/TimesheetPage';
import { navForRole, NavKey } from './pm/nav';
import { AdminUsers } from './pm/AdminUsers';
import { AdminSkills } from './pm/AdminSkills';
import { Projects } from './pm/Projects';
import { MyTasks } from './pm/MyTasks';
import { MySkills } from './pm/MySkills';

function viewFor(key: NavKey) {
  switch (key) {
    case 'users': return <AdminUsers />;
    case 'skills': return <AdminSkills />;
    case 'projects': return <Projects />;
    case 'my-tasks': return <MyTasks />;
    case 'my-skills': return <MySkills />;
    case 'timesheet': return <TimesheetPage />;
  }
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const items = navForRole(user?.role ?? 'employee');
  const [active, setActive] = useState<NavKey>(items[0].key);

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand"><span className="logo">A</span><span className="name">Auth Service</span></div>
        <nav className="shell-nav">
          {items.map((it) => (
            <a key={it.key} className={`shell-nav-item${active === it.key ? ' active' : ''}`}
              href="#" onClick={(e) => { e.preventDefault(); setActive(it.key); }}>
              {it.label}
            </a>
          ))}
        </nav>
        <div className="shell-user">
          <div className="shell-user-email">{user?.email}</div>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="shell-content">
        {viewFor(active)}
      </main>
    </div>
  );
}
