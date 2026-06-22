export type Role = 'admin' | 'pm' | 'employee';
export type NavKey = 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance';
export type NavItem = { key: NavKey; label: string };

export function navForRole(role: Role): NavItem[] {
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet' };
  const attendance: NavItem = { key: 'attendance', label: 'Attendance' };
  if (role === 'admin') {
    return [
      { key: 'users', label: 'Users' },
      { key: 'skills', label: 'Skills' },
      { key: 'company-fit', label: 'Company fit' },
      { key: 'projects', label: 'Projects' },
      { key: 'requests', label: 'Requests' },
      timesheet,
      attendance,
    ];
  }
  if (role === 'pm') {
    return [{ key: 'projects', label: 'Projects' }, { key: 'requests', label: 'Requests' }, timesheet, attendance];
  }
  return [
    { key: 'my-tasks', label: 'My Tasks' },
    { key: 'my-skills', label: 'My Skills' },
    { key: 'marketplace', label: 'Marketplace' },
    timesheet,
    attendance,
  ];
}
