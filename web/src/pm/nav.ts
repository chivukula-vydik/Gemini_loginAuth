export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager' | 'hr' | 'finance' | 'team_lead' | 'director' | 'vp';
export type NavKey = 'home' | 'users' | 'skills' | 'departments' | 'shifts' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization' | 'my-team' | 'team-attendance' | 'organisation' | 'profile' | 'payroll' | 'my-payslips' | 'reimbursements' | 'declarations' | 'tax-summary' | 'reimbursement-approvals';
export type NavItem = { key: NavKey; label: string; path: string };
export type NavSection = { title: string; items: NavItem[] };

const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'departments', 'shifts', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'utilization', 'my-team', 'team-attendance', 'organisation', 'profile', 'payroll', 'my-payslips', 'reimbursements', 'declarations', 'tax-summary', 'reimbursement-approvals'];

export function pathForKey(key: NavKey): string {
  return key === 'home' ? '/' : `/${key}`;
}

export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.split('/').filter(Boolean)[0];
  return ALL_NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}

const I = (key: NavKey, label: string): NavItem => ({ key, label, path: key === 'home' ? '/' : `/${key}` });

function sectionsForRole(role: Role): NavSection[] {
  const sections: NavSection[] = [];

  sections.push({ title: '', items: [I('home', 'Home')] });

  {
    const people: NavItem[] = [];
    if (['admin', 'hr', 'director', 'vp'].includes(role)) {
      people.push(I('users', 'Users'));
    }
    if (role === 'admin') {
      people.push(I('skills', 'Skills'), I('departments', 'Departments'), I('shifts', 'Shifts'), I('company-fit', 'Company Fit'));
    }
    people.push(I('organisation', 'Organisation'));
    sections.push({ title: 'People', items: people });
  }

  if (['admin', 'pm', 'finance', 'director', 'vp'].includes(role)) {
    const work: NavItem[] = [I('projects', 'Projects')];
    if (role !== 'finance') work.push(I('my-tasks', 'My Tasks'));
    work.push(I('timesheet', 'Timesheet'));
    work.push(I('utilization', 'Utilization'));
    sections.push({ title: 'Work', items: work });
  } else if (['reporting_manager', 'team_lead'].includes(role)) {
    sections.push({ title: 'Work', items: [I('my-tasks', 'My Tasks'), I('timesheet', 'Timesheet')] });
  } else if (role === 'employee') {
    sections.push({ title: 'Work', items: [I('my-tasks', 'My Tasks'), I('timesheet', 'Timesheet')] });
  } else {
    sections.push({ title: 'Work', items: [I('timesheet', 'Timesheet')] });
  }

  const attLeave: NavItem[] = [I('attendance', 'Attendance')];
  if (['admin', 'pm', 'reporting_manager', 'team_lead', 'hr', 'director', 'vp'].includes(role)) {
    attLeave.push(I('requests', 'Requests'));
  }
  if (['reporting_manager', 'team_lead', 'hr', 'director', 'vp'].includes(role)) {
    attLeave.push(I('team-attendance', 'Team Attendance'));
  }
  attLeave.push(I('reimbursements', 'Reimbursements'));
  sections.push({ title: 'Attendance & Leave', items: attLeave });

  if (['admin', 'finance'].includes(role)) {
    sections.push({ title: 'Payroll', items: [I('payroll', 'Payroll'), I('my-payslips', 'My Payslips')] });
  } else {
    sections.push({ title: 'Payroll', items: [I('my-payslips', 'My Payslips')] });
  }

  const growth: NavItem[] = [I('my-skills', 'My Skills'), I('marketplace', 'Marketplace')];
  sections.push({ title: 'Growth', items: growth });

  return sections;
}

export function navSectionsForRoles(roles: Role[]): NavSection[] {
  const seen = new Set<NavKey>();
  const result: NavSection[] = [];
  const priority: Role[] = ['admin', 'vp', 'director', 'pm', 'hr', 'finance', 'reporting_manager', 'team_lead', 'employee'];
  const ordered = priority.filter((r) => roles.includes(r));
  if (ordered.length === 0) ordered.push('employee');

  const sectionMap = new Map<string, NavSection>();

  for (const role of ordered) {
    for (const section of sectionsForRole(role)) {
      const key = section.title || '__home__';
      if (!sectionMap.has(key)) {
        sectionMap.set(key, { title: section.title, items: [] });
      }
      const merged = sectionMap.get(key)!;
      for (const item of section.items) {
        if (!seen.has(item.key)) {
          seen.add(item.key);
          merged.items.push(item);
        }
      }
    }
  }

  for (const sec of sectionMap.values()) {
    if (sec.items.length > 0) result.push(sec);
  }
  return result;
}

export function navForRoles(roles: Role[]): NavItem[] {
  return navSectionsForRoles(roles).flatMap(s => s.items);
}
