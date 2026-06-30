import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFeature } from './featureFlags.js';

const flags = {
  users:     { featureKey: 'users',     enabled: true,  roleGrants: ['admin', 'hr'], readonlyRoles: ['employee'] },
  projects:  { featureKey: 'projects',  enabled: true,  roleGrants: ['admin', 'pm'], readonlyRoles: [] },
  payroll:   { featureKey: 'payroll',   enabled: false, roleGrants: ['admin', 'finance'], readonlyRoles: ['hr'] },
  timesheet: { featureKey: 'timesheet', enabled: true,  roleGrants: ['admin', 'employee'], readonlyRoles: ['finance'] },
};

beforeEach(() => { delete process.env.ADMIN_EMAIL; });

test('grants full when role matches roleGrants', () => {
  assert.equal(resolveFeature('timesheet', { email: 'a@b.com', roles: ['employee'] }, flags), 'full');
});

test('denies when role matches neither roleGrants nor readonlyRoles', () => {
  assert.equal(resolveFeature('users', { email: 'a@b.com', roles: ['pm'] }, flags), false);
});

test('global kill-switch denies everyone', () => {
  assert.equal(resolveFeature('payroll', { email: 'a@b.com', roles: ['admin'] }, flags), false);
});

test('user override full grants against role', () => {
  assert.equal(resolveFeature('users', { email: 'a@b.com', roles: ['employee'], featureOverrides: { users: 'full' } }, flags), 'full');
});

test('user override off revokes against role', () => {
  assert.equal(resolveFeature('timesheet', { email: 'a@b.com', roles: ['employee'], featureOverrides: { timesheet: 'off' } }, flags), false);
});

test('global kill-switch beats user override', () => {
  assert.equal(resolveFeature('payroll', { email: 'a@b.com', roles: ['admin'], featureOverrides: { payroll: 'full' } }, flags), false);
});

test('super-admin gets full access', () => {
  process.env.ADMIN_EMAIL = 'super@b.com';
  assert.equal(resolveFeature('payroll', { email: 'super@b.com', roles: ['employee'] }, flags), 'full');
});

test('unknown feature returns false', () => {
  assert.equal(resolveFeature('nonexistent', { email: 'a@b.com', roles: ['admin'] }, flags), false);
});

test('readonly role gets readonly access', () => {
  assert.equal(resolveFeature('users', { email: 'a@b.com', roles: ['employee'] }, flags), 'readonly');
});

test('full role beats readonly — no downgrade', () => {
  assert.equal(resolveFeature('users', { email: 'a@b.com', roles: ['admin', 'employee'] }, flags), 'full');
});

test('user override readonly grants readonly', () => {
  assert.equal(resolveFeature('projects', { email: 'a@b.com', roles: ['employee'], featureOverrides: { projects: 'readonly' } }, flags), 'readonly');
});

test('legacy on override treated as full', () => {
  assert.equal(resolveFeature('users', { email: 'a@b.com', roles: ['pm'], featureOverrides: { users: 'on' } }, flags), 'full');
});
