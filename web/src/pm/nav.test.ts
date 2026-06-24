import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navForRoles } from './nav.ts';

test('admin nav', () => {
  assert.deepEqual(navForRoles(['admin']).map((n) => n.key), ['home', 'users', 'skills', 'company-fit', 'projects', 'requests', 'utilization', 'timesheet', 'attendance']);
});

test('pm nav', () => {
  assert.deepEqual(navForRoles(['pm']).map((n) => n.key), ['home', 'projects', 'requests', 'utilization', 'timesheet', 'attendance']);
});

test('employee nav', () => {
  assert.deepEqual(navForRoles(['employee']).map((n) => n.key), ['home', 'my-tasks', 'my-skills', 'marketplace', 'timesheet', 'attendance']);
});

test('reporting_manager nav', () => {
  assert.deepEqual(navForRoles(['reporting_manager']).map((n) => n.key), ['home', 'requests', 'timesheet', 'attendance']);
});

test('multi-role merges nav items', () => {
  const keys = navForRoles(['pm', 'reporting_manager']).map((n) => n.key);
  assert.ok(keys.includes('projects'), 'has PM projects');
  assert.ok(keys.includes('requests'), 'has requests');
  assert.ok(keys.indexOf('home') === 0, 'home is first');
  const unique = new Set(keys);
  assert.equal(keys.length, unique.size, 'no duplicates');
});
