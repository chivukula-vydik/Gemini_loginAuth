import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFlow } from './approvalEngine.js';

test('validateFlow rejects empty name', () => {
  const errors = validateFlow({ name: '', appliesTo: { entityType: 'x' }, steps: [{ order: 1, name: 'A', approverType: 'manager', rule: 'any' }] });
  assert.ok(errors.some(e => e.includes('name')));
});

test('validateFlow rejects no steps', () => {
  const errors = validateFlow({ name: 'X', appliesTo: { entityType: 'x' }, steps: [] });
  assert.ok(errors.some(e => e.includes('step')));
});

test('validateFlow rejects step with no approvers (non-manager)', () => {
  const errors = validateFlow({
    name: 'X',
    appliesTo: { entityType: 'x' },
    steps: [{ order: 1, name: 'A', approverType: 'role', approvers: [], rule: 'any' }],
  });
  assert.ok(errors.some(e => e.includes('approver')));
});

test('validateFlow accepts manager step with empty approvers', () => {
  const errors = validateFlow({
    name: 'X',
    appliesTo: { entityType: 'x' },
    steps: [{ order: 1, name: 'A', approverType: 'manager', approvers: [], rule: 'any' }],
  });
  assert.equal(errors.length, 0);
});

test('validateFlow rejects missing entityType', () => {
  const errors = validateFlow({
    name: 'X',
    appliesTo: {},
    steps: [{ order: 1, name: 'A', approverType: 'manager', rule: 'any' }],
  });
  assert.ok(errors.some(e => e.includes('entityType')));
});

test('validateFlow accepts valid flow', () => {
  const errors = validateFlow({
    name: 'Reimbursement Approval',
    appliesTo: { entityType: 'reimbursement' },
    steps: [
      { order: 1, name: 'Manager', approverType: 'manager', approvers: [], rule: 'any' },
      { order: 2, name: 'Finance', approverType: 'role', approvers: ['finance'], rule: 'all' },
    ],
  });
  assert.equal(errors.length, 0);
});
