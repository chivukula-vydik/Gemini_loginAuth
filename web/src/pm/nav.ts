export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager';
export type NavKey = 'home' | 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization';
export type NavItem = { key: NavKey; label: string };

export function navForRole(role: Role): NavItem[] {
  const home: NavItem = { key: 'home', label: 'Home' };
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet' };
  const attendance: NavItem = { key: 'attendance', label: 'Attendance' };
  if (role === 'admin') {
    return [
      home,
      { key: 'users', label: 'Users' },
      { key: 'skills', label: 'Skills' },
      { key: 'company-fit', label: 'Company fit' },
      { key: 'projects', label: 'Projects' },
      { key: 'requests', label: 'Requests' },
      { key: 'utilization', label: 'Utilization' },
      timesheet,
      attendance,
    ];
  }
  if (role === 'pm') {
    return [home, { key: 'projects', label: 'Projects' }, { key: 'requests', label: 'Requests' }, { key: 'utilization', label: 'Utilization' }, timesheet, attendance];
  }
  if (role === 'reporting_manager') {
    return [
      home,
      { key: 'requests', label: 'Requests' },
      timesheet,
      attendance,
    ];
  }
  return [
    home,
    { key: 'my-tasks', label: 'My Tasks' },
    { key: 'my-skills', label: 'My Skills' },
    { key: 'marketplace', label: 'Marketplace' },
    timesheet,
    attendance,
  ];
}
