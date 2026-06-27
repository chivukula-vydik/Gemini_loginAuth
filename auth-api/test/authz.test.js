import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoles, canViewProject, canEditProject, canCreateTask, canLogProgress } from '../src/services/authz.js';

test('resolveRoles: promotes the configured ADMIN_EMAIL', () => {
  const user = { email: 'boss@acme.com', roles: ['employee'] };
  const roles = resolveRoles(user, { ADMIN_EMAIL: 'boss@acme.com' });
  assert.ok(roles.includes('admin'));
});

test('resolveRoles: case-insensitive email match', () => {
  const user = { email: 'Boss@Acme.com', roles: ['employee'] };
  const roles = resolveRoles(user, { ADMIN_EMAIL: 'boss@acme.com' });
  assert.ok(roles.includes('admin'));
});

test('resolveRoles: keeps stored roles when no match', () => {
  assert.deepEqual(resolveRoles({ email: 'a@b.com', roles: ['pm'] }, { ADMIN_EMAIL: 'boss@acme.com' }), ['pm']);
  assert.deepEqual(resolveRoles({ email: 'a@b.com' }, {}), ['employee']);
});

test('canViewProject: admin, owner, and members can view; others cannot', () => {
  const project = { ownerPm: 'pm1', members: ['emp1'] };
  assert.equal(canViewProject({ sub: 'x', roles: ['admin'] }, project), true);
  assert.equal(canViewProject({ sub: 'pm1', roles: ['pm'] }, project), true);
  assert.equal(canViewProject({ sub: 'emp1', roles: ['employee'] }, project), true);
  assert.equal(canViewProject({ sub: 'emp2', roles: ['employee'] }, project), false);
});

test('canEditProject: admin or owning PM only', () => {
  const project = { ownerPm: 'pm1', members: ['emp1'] };
  assert.equal(canEditProject({ sub: 'pm1', roles: ['pm'] }, project), true);
  assert.equal(canEditProject({ sub: 'pm2', roles: ['pm'] }, project), false);
  assert.equal(canEditProject({ sub: 'emp1', roles: ['employee'] }, project), false);
  assert.equal(canEditProject({ sub: 'x', roles: ['admin'] }, project), true);
});

test('canCreateTask: matches canEditProject rule', () => {
  const project = { ownerPm: 'pm1', members: [] };
  assert.equal(canCreateTask({ sub: 'pm1', roles: ['pm'] }, project), true);
  assert.equal(canCreateTask({ sub: 'pm2', roles: ['pm'] }, project), false);
});

test('canLogProgress: only the assignee may log progress', () => {
  const task = { assignees: [{ user: 'emp1', sharePct: 100 }] };
  assert.equal(canLogProgress({ sub: 'emp1' }, task), true);
  assert.equal(canLogProgress({ sub: 'emp2' }, task), false);
  assert.equal(canLogProgress({ sub: 'emp1' }, { assignees: [] }), false);
});

test('canLogProgress: true when user is among assignees, false otherwise', () => {
  const task = { assignees: [{ user: 'u1', sharePct: 50 }, { user: 'u2', sharePct: 50 }] };
  assert.equal(canLogProgress({ sub: 'u2' }, task), true);
  assert.equal(canLogProgress({ sub: 'u3' }, task), false);
  assert.equal(canLogProgress({ sub: 'u1' }, { assignees: [] }), false);
});
