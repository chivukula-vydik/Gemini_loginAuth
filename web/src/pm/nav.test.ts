import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navForRoles } from './nav.ts';

// ponytail: all roles now get the full nav — feature flag filter in AppShell
// handles visibility, so overrides always surface the correct links

const COMMON_KEYS = [
  'home',
  'users', 'skills', 'departments', 'shifts', 'company-fit', 'organisation',
  'projects', 'my-tasks', 'timesheet', 'utilization',
  'attendance', 'requests', 'team-attendance', 'my-requests', 'reimbursements',
  'payroll', 'my-payslips', 'declarations', 'tax-summary', 'declaration-review', 'my-loans', 'loan-management',
  'onboarding', 'onboarding-templates', 'onboarding-tasks',
  'my-skills', 'marketplace',
];

test('admin nav', () => {
  const keys = navForRoles(['admin']).map((n) => n.key);
  assert.deepEqual(keys, [
    ...COMMON_KEYS.slice(0, 7), // up to organisation
    'feature-management', 'approval-flows', 'roster-import',
    ...COMMON_KEYS.slice(7), // projects onward
  ]);
});

test('employee nav', () => {
  const keys = navForRoles(['employee']).map((n) => n.key);
  assert.deepEqual(keys, [
    ...COMMON_KEYS.slice(0, 7),
    'approval-flows',
    ...COMMON_KEYS.slice(7),
  ]);
});

test('all roles get same base items', () => {
  for (const role of ['pm', 'reporting_manager', 'team_lead', 'hr', 'finance', 'director', 'vp']) {
    const keys = navForRoles([role]).map((n) => n.key);
    for (const k of COMMON_KEYS) {
      assert.ok(keys.includes(k), `${role} nav missing ${k}`);
    }
  }
});

test('multi-role no duplicates', () => {
  const keys = navForRoles(['pm', 'reporting_manager']).map((n) => n.key);
  assert.ok(keys.indexOf('home') === 0, 'home is first');
  const unique = new Set(keys);
  assert.equal(keys.length, unique.size, 'no duplicates');
});
