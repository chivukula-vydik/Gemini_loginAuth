import { type ReactElement, useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './authContext';
import { useFeatures, ReadonlyGuard } from './featureContext';
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
import { OnboardingBoard, CaseDetail, MyOnboardingTasks, TemplateBuilder } from './onboarding/index';
import { MyRequests } from './pm/MyRequests';
import { NotificationDropdown, DropdownItem } from './dashboard/NotificationDropdown';
import {
  getInbox, getInboxUnreadCount, markInboxRead, markAllInboxRead,
  getNotifications, getNotificationsUnreadCount, markNotificationRead, markAllNotificationsRead,
  InboxItem, NotificationItem,
} from './dashboard/inboxApi';
import { PayrollRunList, PayrollRunDetail, SalaryEditor, MyPayslips, Declarations, TaxSummary, Reimbursements, RegimeComparison, DeclarationReview, MyLoans, LoanManagement } from './payroll/index';
import { FeatureManagement } from './pm/FeatureManagement';
import { ApprovalFlowBuilder } from './pm/ApprovalFlowBuilder';
import { RosterImport } from './pm/RosterImport';

const NAV_ICONS: Record<NavKey, ReactElement> = {
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />,
  users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  skills: <path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 21l2.3-7.1-6-4.5h7.6z" />,
  departments: <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11" />,
  shifts: <path d="M12 2v10l4.5 2.6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  'company-fit': <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3M9 11l3 3L22 4" />,
  'feature-management': <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  'approval-flows': <path d="M9 11l3 3L22 4M4 12l3 3 3-3M4 5h16M4 19h16" />,
  'roster-import': <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  projects: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  requests: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />,
  marketplace: <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />,
  'my-tasks': <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  'my-skills': <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  timesheet: <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  attendance: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11l-4 4-2-2" />,
  'my-requests': <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 14l2 2 4-4" />,
  utilization: <path d="M18 20V10M12 20V4M6 20v-6" />,
  'my-team': <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  'team-attendance': <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 14v4l2-1 2 1v-4" />,
  organisation: <path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 8v4M12 12H6M12 12h6M6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  onboarding: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />,
  'onboarding-tasks': <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  'onboarding-templates': <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6" />,
  profile: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  payroll: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  'my-payslips': <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  reimbursements: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  declarations: <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 14l2 2 4-4" />,
  'tax-summary': <path d="M4 7h16M4 11h16M4 15h10M4 19h6" />,
  'declaration-review': <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M12 12l2 2 4-4" />,
  'my-loans': <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  'loan-management': <path d="M2 17h2.4L6 13l4 8 4-12 2 4h6" />,
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
  const { features } = useFeatures();
  const allSections = navSectionsForRoles(user?.roles ?? ['employee']);
  // ponytail: filter nav by resolved features — home/profile always visible
  const ALWAYS_VISIBLE = new Set(['home', 'profile']);
  const sections = allSections.map(sec => ({
    ...sec,
    items: sec.items.filter(it => ALWAYS_VISIBLE.has(it.key) || features[it.key] !== false),
  })).filter(sec => sec.items.length > 0);
  const navigate = useNavigate();
  const location = useLocation();
  const active = keyForPath(location.pathname);
  const name = personName(user);
  const initial = (name[0] ?? '?').toUpperCase();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = useCallback((title: string) => {
    setCollapsed(prev => ({ ...prev, [title]: !prev[title] }));
  }, []);

  const [inboxCount, setInboxCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [showInbox, setShowInbox] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    function poll() {
      getInboxUnreadCount().then((r) => setInboxCount(r.count)).catch(() => {});
      getNotificationsUnreadCount().then((r) => setNotifCount(r.count)).catch(() => {});
    }
    poll();
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, []);

  async function openInbox() {
    setShowNotifs(false);
    setShowInbox(!showInbox);
    if (!showInbox) {
      const res = await getInbox();
      setInboxItems(res.items);
    }
  }

  async function openNotifs() {
    setShowInbox(false);
    setShowNotifs(!showNotifs);
    if (!showNotifs) {
      const res = await getNotifications();
      setNotifItems(res.items);
    }
  }

  function inboxDropdownItems(): DropdownItem[] {
    return inboxItems.map((item) => {
      const name = item.sender?.displayName || 'Former Employee';
      const textMap: Record<string, string> = {
        birthday_wish: `${name} sent you a birthday wish: ${item.body}`,
        praise: `${name} praised you: ${item.body.slice(0, 60)}`,
        comment: `${name} commented on your post: ${item.body.slice(0, 60)}`,
      };
      return {
        _id: item._id,
        person: item.sender,
        text: textMap[item.type] || item.body,
        read: item.read,
        createdAt: item.createdAt,
        onClick: () => {
          markInboxRead(item._id).then(() => {
            setInboxItems((prev) => prev.map((i) => i._id === item._id ? { ...i, read: true } : i));
            setInboxCount((c) => Math.max(0, c - (item.read ? 0 : 1)));
          });
          if (item.refItem && item.type !== 'birthday_wish') navigate('/');
        },
      };
    });
  }

  function notifDropdownItems(): DropdownItem[] {
    return notifItems.map((item) => {
      const name = item.actor?.displayName || 'Former Employee';
      const textMap: Record<string, string> = {
        like: `${name} liked your post`,
        leave_approved: 'Your leave request was approved',
        leave_rejected: 'Your leave request was rejected',
        timesheet_approved: 'Your timesheet was approved',
        claim_approved: 'Your claim was approved',
        claim_denied: 'Your claim was denied',
      };
      const navMap: Record<string, string> = {
        like: '/',
        leave_approved: '/attendance',
        leave_rejected: '/attendance',
        claim_approved: '/my-requests',
        claim_denied: '/my-requests',
      };
      return {
        _id: item._id,
        person: item.actor,
        text: textMap[item.type] || `${name} — ${item.type}`,
        read: item.read,
        createdAt: item.createdAt,
        onClick: () => {
          markNotificationRead(item._id).then(() => {
            setNotifItems((prev) => prev.map((n) => n._id === item._id ? { ...n, read: true } : n));
            setNotifCount((c) => Math.max(0, c - (item.read ? 0 : 1)));
          });
          const target = navMap[item.type];
          if (target) navigate(target);
        },
      };
    });
  }

  async function handleMarkAllInboxRead() {
    await markAllInboxRead();
    setInboxItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setInboxCount(0);
  }

  async function handleMarkAllNotifsRead() {
    await markAllNotificationsRead();
    setNotifItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setNotifCount(0);
  }

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
          <div className="shell-notif-row">
            <div className="shell-notif-wrapper">
              <button className="shell-notif-btn" onClick={openInbox} aria-label="Inbox">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                {inboxCount > 0 && <span className="shell-notif-badge">{inboxCount > 99 ? '99+' : inboxCount}</span>}
              </button>
              {showInbox && (
                <NotificationDropdown
                  title="Inbox"
                  icon={null}
                  badge={inboxCount}
                  items={inboxDropdownItems()}
                  onMarkAllRead={handleMarkAllInboxRead}
                  onClose={() => setShowInbox(false)}
                />
              )}
            </div>
            <div className="shell-notif-wrapper">
              <button className="shell-notif-btn" onClick={openNotifs} aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {notifCount > 0 && <span className="shell-notif-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
              </button>
              {showNotifs && (
                <NotificationDropdown
                  title="Notifications"
                  icon={null}
                  badge={notifCount}
                  items={notifDropdownItems()}
                  onMarkAllRead={handleMarkAllNotifsRead}
                  onClose={() => setShowNotifs(false)}
                />
              )}
            </div>
            <ThemeToggle />
          </div>
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
          <Route path="/users" element={<ReadonlyGuard featureKey="users"><AdminUsers /></ReadonlyGuard>} />
          <Route path="/users/:id" element={<ReadonlyGuard featureKey="users"><UserDetailPage /></ReadonlyGuard>} />
          <Route path="/skills" element={<ReadonlyGuard featureKey="skills"><AdminSkills /></ReadonlyGuard>} />
          <Route path="/departments" element={<ReadonlyGuard featureKey="departments"><AdminDepartments /></ReadonlyGuard>} />
          <Route path="/shifts" element={<ReadonlyGuard featureKey="shifts"><AdminShifts /></ReadonlyGuard>} />
          <Route path="/company-fit" element={<ReadonlyGuard featureKey="company-fit"><CompanyFit /></ReadonlyGuard>} />
          <Route path="/projects" element={<ReadonlyGuard featureKey="projects"><Projects /></ReadonlyGuard>} />
          <Route path="/requests" element={<ReadonlyGuard featureKey="requests"><Requests /></ReadonlyGuard>} />
          <Route path="/my-tasks" element={<ReadonlyGuard featureKey="my-tasks"><MyTasks /></ReadonlyGuard>} />
          <Route path="/my-skills" element={<ReadonlyGuard featureKey="my-skills"><MySkills /></ReadonlyGuard>} />
          <Route path="/marketplace" element={<ReadonlyGuard featureKey="marketplace"><Marketplace /></ReadonlyGuard>} />
          <Route path="/timesheet" element={<ReadonlyGuard featureKey="timesheet"><TimesheetPage /></ReadonlyGuard>} />
          <Route path="/attendance" element={<ReadonlyGuard featureKey="attendance"><AttendancePage /></ReadonlyGuard>} />
          <Route path="/my-requests" element={<ReadonlyGuard featureKey="my-requests"><MyRequests /></ReadonlyGuard>} />
          <Route path="/utilization" element={<ReadonlyGuard featureKey="utilization"><Utilization /></ReadonlyGuard>} />
          <Route path="/my-team" element={<ReadonlyGuard featureKey="users"><MyTeam /></ReadonlyGuard>} />
          <Route path="/team-attendance" element={<ReadonlyGuard featureKey="team-attendance"><TeamAttendanceDashboard /></ReadonlyGuard>} />
          <Route path="/organisation" element={<ReadonlyGuard featureKey="organisation"><OrgModule /></ReadonlyGuard>} />
          <Route path="/onboarding" element={<ReadonlyGuard featureKey="onboarding"><OnboardingBoard /></ReadonlyGuard>} />
          <Route path="/onboarding/:id" element={<ReadonlyGuard featureKey="onboarding"><CaseDetail /></ReadonlyGuard>} />
          <Route path="/onboarding-tasks" element={<ReadonlyGuard featureKey="onboarding-tasks"><MyOnboardingTasks /></ReadonlyGuard>} />
          <Route path="/onboarding-templates" element={<ReadonlyGuard featureKey="onboarding-templates"><TemplateBuilder /></ReadonlyGuard>} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/payroll" element={<ReadonlyGuard featureKey="payroll"><PayrollRunList /></ReadonlyGuard>} />
          <Route path="/payroll/run/:id" element={<ReadonlyGuard featureKey="payroll"><PayrollRunDetail /></ReadonlyGuard>} />
          <Route path="/payroll/salary/:userId" element={<ReadonlyGuard featureKey="payroll"><SalaryEditor /></ReadonlyGuard>} />
          <Route path="/my-payslips" element={<ReadonlyGuard featureKey="my-payslips"><MyPayslips /></ReadonlyGuard>} />
          <Route path="/my-payslips/:year/:month" element={<ReadonlyGuard featureKey="my-payslips"><MyPayslips /></ReadonlyGuard>} />
          <Route path="/declarations" element={<ReadonlyGuard featureKey="declarations"><Declarations /></ReadonlyGuard>} />
          <Route path="/declarations/compare" element={<ReadonlyGuard featureKey="declarations"><RegimeComparison /></ReadonlyGuard>} />
          <Route path="/declarations/review" element={<ReadonlyGuard featureKey="declaration-review"><DeclarationReview /></ReadonlyGuard>} />
          <Route path="/my-loans" element={<ReadonlyGuard featureKey="my-loans"><MyLoans /></ReadonlyGuard>} />
          <Route path="/loan-management" element={<ReadonlyGuard featureKey="loan-management"><LoanManagement /></ReadonlyGuard>} />
          <Route path="/tax-summary" element={<ReadonlyGuard featureKey="tax-summary"><TaxSummary /></ReadonlyGuard>} />
          <Route path="/reimbursements" element={<ReadonlyGuard featureKey="reimbursements"><Reimbursements /></ReadonlyGuard>} />
          <Route path="/feature-management" element={<FeatureManagement />} />
          <Route path="/approval-flows" element={<ReadonlyGuard featureKey="approval-flows"><ApprovalFlowBuilder /></ReadonlyGuard>} />
          <Route path="/roster-import" element={<RosterImport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
