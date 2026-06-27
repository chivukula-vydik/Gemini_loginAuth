export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager' | 'hr' | 'finance' | 'team_lead' | 'director' | 'vp';
export type NavKey = 'home' | 'users' | 'skills' | 'departments' | 'shifts' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'my-requests' | 'utilization' | 'my-team' | 'team-attendance' | 'organisation' | 'onboarding' | 'onboarding-tasks' | 'onboarding-templates';
export type NavItem = { key: NavKey; label: string; path: string };

const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'departments', 'shifts', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'my-requests', 'utilization', 'my-team', 'team-attendance', 'organisation', 'onboarding', 'onboarding-tasks', 'onboarding-templates'];

export function pathForKey(key: NavKey): string {
  return key === 'home' ? '/' : `/${key}`;
}

export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.slice(1);
  return ALL_NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}

const PERSONAL_BASE: NavItem[] = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'my-tasks', label: 'My Tasks', path: '/my-tasks' },
  { key: 'my-skills', label: 'My Skills', path: '/my-skills' },
  { key: 'marketplace', label: 'Marketplace', path: '/marketplace' },
  { key: 'timesheet', label: 'Timesheet', path: '/timesheet' },
  { key: 'attendance', label: 'Attendance', path: '/attendance' },
  { key: 'my-requests', label: 'My Requests', path: '/my-requests' },
  { key: 'organisation', label: 'Organisation', path: '/organisation' },
];

function roleAdditions(role: Role): NavItem[] {
  switch (role) {
    case 'admin':
      return [
        { key: 'users', label: 'Users', path: '/users' },
        { key: 'skills', label: 'Skills', path: '/skills' },
        { key: 'departments', label: 'Departments', path: '/departments' },
        { key: 'shifts', label: 'Shifts', path: '/shifts' },
        { key: 'company-fit', label: 'Company fit', path: '/company-fit' },
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
        { key: 'onboarding', label: 'Onboarding', path: '/onboarding' },
        { key: 'onboarding-tasks', label: 'Onboarding Tasks', path: '/onboarding-tasks' },
        { key: 'onboarding-templates', label: 'Onboarding Templates', path: '/onboarding-templates' },
      ];
    case 'pm':
      return [
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'reporting_manager':
      return [
        { key: 'my-team', label: 'My Team', path: '/my-team' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'team_lead':
      return [
        { key: 'my-team', label: 'My Team', path: '/my-team' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'hr':
      return [
        { key: 'users', label: 'Users', path: '/users' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
        { key: 'onboarding', label: 'Onboarding', path: '/onboarding' },
        { key: 'onboarding-tasks', label: 'Onboarding Tasks', path: '/onboarding-tasks' },
        { key: 'onboarding-templates', label: 'Onboarding Templates', path: '/onboarding-templates' },
      ];
    case 'finance':
      return [
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
      ];
    case 'director':
    case 'vp':
      return [
        { key: 'users', label: 'Users', path: '/users' },
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'employee':
    default:
      return [];
  }
}

export function navForRoles(roles: Role[]): NavItem[] {
  const seen = new Set<NavKey>();
  const result: NavItem[] = [];

  for (const item of PERSONAL_BASE) {
    seen.add(item.key);
    result.push(item);
  }

  const priority: Role[] = ['admin', 'pm', 'hr', 'finance', 'reporting_manager', 'team_lead', 'director', 'vp'];
  const ordered = priority.filter((r) => roles.includes(r));
  for (const role of ordered) {
    for (const item of roleAdditions(role)) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        result.push(item);
      }
    }
  }

  return result;
}
