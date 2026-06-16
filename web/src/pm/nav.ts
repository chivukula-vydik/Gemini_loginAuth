export type Role = 'admin' | 'pm' | 'employee';
export type NavKey = 'users' | 'skills' | 'projects' | 'my-tasks' | 'my-skills' | 'timesheet';
export type NavItem = { key: NavKey; label: string };

export function navForRole(role: Role): NavItem[] {
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet' };
  if (role === 'admin') {
    return [{ key: 'users', label: 'Users' }, { key: 'skills', label: 'Skills' }, timesheet];
  }
  if (role === 'pm') {
    return [{ key: 'projects', label: 'Projects' }, timesheet];
  }
  return [{ key: 'my-tasks', label: 'My Tasks' }, { key: 'my-skills', label: 'My Skills' }, timesheet];
}
