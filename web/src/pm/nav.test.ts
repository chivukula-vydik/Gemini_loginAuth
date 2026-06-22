import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navForRole } from './nav.ts';

test('admin nav', () => {
  assert.deepEqual(navForRole('admin').map((n) => n.key), ['users', 'skills', 'company-fit', 'projects', 'requests', 'timesheet', 'attendance']);
});

test('pm nav', () => {
  assert.deepEqual(navForRole('pm').map((n) => n.key), ['projects', 'requests', 'timesheet', 'attendance']);
});

test('employee nav', () => {
  assert.deepEqual(navForRole('employee').map((n) => n.key), ['my-tasks', 'my-skills', 'marketplace', 'timesheet', 'attendance']);
});
