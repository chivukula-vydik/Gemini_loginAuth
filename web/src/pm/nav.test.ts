import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navForRoles } from './nav.ts';

test('admin nav', () => {
  assert.deepEqual(navForRoles(['admin']).map((n) => n.key), [
    'home', 'users', 'skills', 'departments', 'shifts', 'company-fit', 'organisation',
    'projects', 'my-tasks', 'timesheet', 'utilization',
    'attendance', 'requests', 'reimbursements',
    'payroll', 'my-payslips',
    'my-skills', 'marketplace',
  ]);
});

test('pm nav', () => {
  assert.deepEqual(navForRoles(['pm']).map((n) => n.key), [
    'home', 'organisation',
    'projects', 'my-tasks', 'timesheet', 'utilization',
    'attendance', 'requests', 'reimbursements',
    'my-payslips',
    'my-skills', 'marketplace',
  ]);
});

test('employee nav', () => {
  assert.deepEqual(navForRoles(['employee']).map((n) => n.key), [
    'home', 'organisation',
    'my-tasks', 'timesheet',
    'attendance', 'reimbursements',
    'my-payslips',
    'my-skills', 'marketplace',
  ]);
});

test('reporting_manager nav', () => {
  assert.deepEqual(navForRoles(['reporting_manager']).map((n) => n.key), [
    'home', 'organisation',
    'my-tasks', 'timesheet',
    'attendance', 'requests', 'team-attendance', 'reimbursements',
    'my-payslips',
    'my-skills', 'marketplace',
  ]);
});

test('multi-role merges nav items', () => {
  const keys = navForRoles(['pm', 'reporting_manager']).map((n) => n.key);
  assert.ok(keys.includes('projects'), 'has PM projects');
  assert.ok(keys.includes('requests'), 'has requests');
  assert.ok(keys.indexOf('home') === 0, 'home is first');
  const unique = new Set(keys);
  assert.equal(keys.length, unique.size, 'no duplicates');
});
