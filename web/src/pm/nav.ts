export type Role = string;

const ALL_NAV_KEYS = ['home', 'users', 'skills', 'departments', 'shifts', 'company-fit', 'feature-management', 'approval-flows', 'roster-import', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'my-requests', 'utilization', 'my-team', 'team-attendance', 'organisation', 'profile', 'payroll', 'my-payslips', 'reimbursements', 'declarations', 'tax-summary', 'declaration-review', 'my-loans', 'loan-management', 'onboarding', 'onboarding-tasks', 'onboarding-templates'] as const;
export type NavKey = (typeof ALL_NAV_KEYS)[number];
export type NavItem = { key: NavKey; label: string; path: string };
export type NavSection = { title: string; items: NavItem[] };

const CUSTOM_PATHS: Partial<Record<NavKey, string>> = {
  'declaration-review': '/declarations/review',
};

export function pathForKey(key: NavKey): string {
  if (CUSTOM_PATHS[key]) return CUSTOM_PATHS[key];
  return key === 'home' ? '/' : `/${key}`;
}

export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.split('/').filter(Boolean)[0];
  return ALL_NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}

const I = (key: NavKey, label: string): NavItem => ({ key, label, path: pathForKey(key) });

// ponytail: nav includes ALL items regardless of role — the feature flag
// filter in AppShell handles visibility so overrides aren't hidden
function allSections(role: Role): NavSection[] {
  const sections: NavSection[] = [];

  sections.push({ title: '', items: [I('home', 'Home')] });

  {
    const people: NavItem[] = [
      I('users', 'Users'),
      I('skills', 'Skills'),
      I('departments', 'Departments'),
      I('shifts', 'Shifts'),
      I('company-fit', 'Company Fit'),
      I('organisation', 'Organisation'),
    ];
    if (role === 'admin') {
      people.push(I('feature-management', 'Features'), I('approval-flows', 'Approvals'), I('roster-import', 'Import'));
    } else {
      people.push(I('approval-flows', 'Approvals'));
    }
    sections.push({ title: 'People', items: people });
  }

  sections.push({ title: 'Work', items: [
    I('projects', 'Projects'),
    I('my-tasks', 'My Tasks'),
    I('timesheet', 'Timesheet'),
    I('utilization', 'Utilization'),
  ] });

  sections.push({ title: 'Attendance & Leave', items: [
    I('attendance', 'Attendance'),
    I('requests', 'Requests'),
    I('team-attendance', 'Team Attendance'),
    I('my-requests', 'My Requests'),
    I('reimbursements', 'Reimbursements'),
  ] });

  sections.push({ title: 'Payroll', items: [
    I('payroll', 'Payroll'),
    I('my-payslips', 'My Payslips'),
    I('declarations', 'Declarations'),
    I('tax-summary', 'Tax Summary'),
    I('declaration-review', 'Declaration Review'),
    I('my-loans', 'My Loans'),
    I('loan-management', 'Loan Management'),
  ] });

  sections.push({ title: 'Onboarding', items: [
    I('onboarding', 'Onboarding'),
    I('onboarding-templates', 'Onboarding Templates'),
    I('onboarding-tasks', 'My Onboarding'),
  ] });

  sections.push({ title: 'Growth', items: [I('my-skills', 'My Skills'), I('marketplace', 'Marketplace')] });

  return sections;
}

export function navSectionsForRoles(roles: Role[]): NavSection[] {
  const primary = roles[0] || 'employee';
  return allSections(primary);
}

export function navForRoles(roles: Role[]): NavItem[] {
  return navSectionsForRoles(roles).flatMap(s => s.items);
}
