export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager';
export type NavKey = 'home' | 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization' | 'my-team';
export type NavItem = { key: NavKey; label: string; path: string };

const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'utilization', 'my-team'];

export function pathForKey(key: NavKey): string {
  return key === 'home' ? '/' : `/${key}`;
}

export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.slice(1);
  return ALL_NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}

function navForRole(role: Role): NavItem[] {
  const home: NavItem = { key: 'home', label: 'Home', path: '/' };
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet', path: '/timesheet' };
  const attendance: NavItem = { key: 'attendance', label: 'Attendance', path: '/attendance' };
  if (role === 'admin') {
    return [
      home,
      { key: 'users', label: 'Users', path: '/users' },
      { key: 'skills', label: 'Skills', path: '/skills' },
      { key: 'company-fit', label: 'Company fit', path: '/company-fit' },
      { key: 'projects', label: 'Projects', path: '/projects' },
      { key: 'requests', label: 'Requests', path: '/requests' },
      { key: 'utilization', label: 'Utilization', path: '/utilization' },
      timesheet,
      attendance,
    ];
  }
  if (role === 'pm') {
    return [home, { key: 'projects', label: 'Projects', path: '/projects' }, { key: 'requests', label: 'Requests', path: '/requests' }, { key: 'utilization', label: 'Utilization', path: '/utilization' }, timesheet, attendance];
  }
  if (role === 'reporting_manager') {
    return [
      home,
      { key: 'my-team', label: 'My Team', path: '/my-team' },
      { key: 'requests', label: 'Requests', path: '/requests' },
      timesheet,
      attendance,
    ];
  }
  return [
    home,
    { key: 'my-tasks', label: 'My Tasks', path: '/my-tasks' },
    { key: 'my-skills', label: 'My Skills', path: '/my-skills' },
    { key: 'marketplace', label: 'Marketplace', path: '/marketplace' },
    timesheet,
    attendance,
  ];
}

export function navForRoles(roles: Role[]): NavItem[] {
  const seen = new Set<NavKey>();
  const result: NavItem[] = [];
  const priority: Role[] = ['admin', 'pm', 'reporting_manager', 'employee'];
  const ordered = priority.filter((r) => roles.includes(r));
  if (ordered.length === 0) ordered.push('employee');
  for (const role of ordered) {
    for (const item of navForRole(role)) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        result.push(item);
      }
    }
  }
  return result;
}
