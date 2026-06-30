import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFeature } from './featureFlags.js';

// Use real registry keys
const flags = {
  users:     { featureKey: 'users',     enabled: true,  roleGrants: ['admin', 'hr'] },
  projects:  { featureKey: 'projects',  enabled: true,  roleGrants: ['admin', 'pm'] },
  payroll:   { featureKey: 'payroll',   enabled: false, roleGrants: ['admin', 'finance'] },
  timesheet: { featureKey: 'timesheet', enabled: true,  roleGrants: ['admin', 'employee'] },
};

beforeEach(() => { delete process.env.ADMIN_EMAIL; });

test('grants when role matches', () => {
  assert.equal(resolveFeature('timesheet', { email: 'a@b.com', roles: ['employee'] }, flags), true);
});

test('denies when role does not match', () => {
  assert.equal(resolveFeature('users', { email: 'a@b.com', roles: ['employee'] }, flags), false);
});

test('global kill-switch denies everyone', () => {
  assert.equal(resolveFeature('payroll', { email: 'a@b.com', roles: ['admin'] }, flags), false);
});

test('user override grants against role', () => {
  assert.equal(resolveFeature('users', { email: 'a@b.com', roles: ['employee'], featureOverrides: { users: 'on' } }, flags), true);
});

test('user override revokes against role', () => {
  assert.equal(resolveFeature('timesheet', { email: 'a@b.com', roles: ['employee'], featureOverrides: { timesheet: 'off' } }, flags), false);
});

test('global kill-switch beats user override', () => {
  assert.equal(resolveFeature('payroll', { email: 'a@b.com', roles: ['admin'], featureOverrides: { payroll: 'on' } }, flags), false);
});

test('super-admin bypasses everything', () => {
  process.env.ADMIN_EMAIL = 'super@b.com';
  assert.equal(resolveFeature('payroll', { email: 'super@b.com', roles: ['employee'] }, flags), true);
});

test('unknown feature returns false', () => {
  assert.equal(resolveFeature('nonexistent', { email: 'a@b.com', roles: ['admin'] }, flags), false);
});
