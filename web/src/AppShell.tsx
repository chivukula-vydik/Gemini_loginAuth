import { type ReactElement, useState, useCallback } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './authContext';
import { TimesheetPage } from './timesheet/TimesheetPage';
import { AttendancePage } from './attendance/AttendancePage';
import { navSectionsForRoles, keyForPath, NavKey } from './pm/nav';
import { AdminUsers } from './pm/AdminUsers';
import { AdminSkills } from './pm/AdminSkills';
import { AdminDepartments } from './pm/AdminDepartments';
import { AdminShifts } from './pm/AdminShifts';
import { OrgModule } from './org/OrgModule';
import { CompanyFit } from './pm/CompanyFit';
import { Projects } from './pm/Projects';
import { MyTasks } from './pm/MyTasks';
import { MySkills } from './pm/MySkills';
import { Requests } from './pm/Requests';
import { Marketplace } from './pm/Marketplace';
import { Utilization } from './pm/Utilization';
import { RoleHome } from './dashboard/RoleHome';
import { ProfilePage } from './dashboard/ProfilePage';
import { UserDetailPage } from './pm/UserDetailPage';
import { MyTeam } from './dashboard/MyTeam';
import { TeamAttendanceDashboard } from './attendance/TeamAttendanceDashboard';
import { ThemeToggle } from './ThemeToggle';
import { personName } from './pm/personName';
import { PayrollRunList, PayrollRunDetail, SalaryEditor, MyPayslips, Declarations, TaxSummary, Reimbursements, ReimbursementApprovals } from './payroll/index';

const NAV_ICONS: Record<NavKey, ReactElement> = {
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />,
  users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  skills: <path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 21l2.3-7.1-6-4.5h7.6z" />,
  departments: <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11" />,
  shifts: <path d="M12 2v10l4.5 2.6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  'company-fit': <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3M9 11l3 3L22 4" />,
  projects: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  requests: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />,
  marketplace: <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />,
  'my-tasks': <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  'my-skills': <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  timesheet: <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  attendance: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11l-4 4-2-2" />,
  utilization: <path d="M18 20V10M12 20V4M6 20v-6" />,
  'my-team': <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  'team-attendance': <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 14v4l2-1 2 1v-4" />,
  organisation: <path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 8v4M12 12H6M12 12h6M6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  profile: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  payroll: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  'my-payslips': <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  reimbursements: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  declarations: <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 14l2 2 4-4" />,
  'tax-summary': <path d="M4 7h16M4 11h16M4 15h10M4 19h6" />,
  'reimbursement-approvals': <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
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
  const sections = navSectionsForRoles(user?.roles ?? ['employee']);
  const navigate = useNavigate();
  const location = useLocation();
  const active = keyForPath(location.pathname);
  const name = personName(user);
  const initial = (name[0] ?? '?').toUpperCase();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = useCallback((title: string) => {
    setCollapsed(prev => ({ ...prev, [title]: !prev[title] }));
  }, []);

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand"><span className="logo">A</span><span className="name">Auth Service</span></div>
        <nav className="shell-nav">
          {sections.map((sec, si) => (
            <div key={si} className={sec.title ? 'shell-nav-section' : ''}>
              {sec.title && (
                <button className="shell-nav-header" onClick={() => toggle(sec.title)}>
                  <svg className="shell-nav-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: collapsed[sec.title] ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>{sec.title}</span>
                </button>
              )}
              {!collapsed[sec.title] && sec.items.map((it) => (
                <a key={it.key} className={`shell-nav-item${active === it.key ? ' active' : ''}`}
                  href={it.path} onClick={(e) => { e.preventDefault(); navigate(it.path); }}>
                  <NavIcon name={it.key} />
                  <span>{it.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="shell-foot">
          <ThemeToggle />
          <div className="shell-user">
            <div className="shell-avatar" style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>{initial}</div>
            <div className="shell-user-meta" style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>
              <div className="shell-user-email">{name}</div>
              {user?.roles && <div className="shell-user-role">{user.roles.join(', ')}</div>}
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
        <Routes>
          <Route path="/" element={<RoleHome />} />
          <Route path="/users" element={<AdminUsers />} />
          <Route path="/users/:id" element={<UserDetailPage />} />
          <Route path="/skills" element={<AdminSkills />} />
          <Route path="/departments" element={<AdminDepartments />} />
          <Route path="/shifts" element={<AdminShifts />} />
          <Route path="/company-fit" element={<CompanyFit />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/my-skills" element={<MySkills />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/timesheet" element={<TimesheetPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/utilization" element={<Utilization />} />
          <Route path="/my-team" element={<MyTeam />} />
          <Route path="/team-attendance" element={<TeamAttendanceDashboard />} />
          <Route path="/organisation" element={<OrgModule />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/payroll" element={<PayrollRunList />} />
          <Route path="/payroll/run/:id" element={<PayrollRunDetail />} />
          <Route path="/payroll/salary/:userId" element={<SalaryEditor />} />
          <Route path="/my-payslips" element={<MyPayslips />} />
          <Route path="/my-payslips/:year/:month" element={<MyPayslips />} />
          <Route path="/declarations" element={<Declarations />} />
          <Route path="/tax-summary" element={<TaxSummary />} />
          <Route path="/reimbursements" element={<Reimbursements />} />
          <Route path="/reimbursement-approvals" element={<ReimbursementApprovals />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
