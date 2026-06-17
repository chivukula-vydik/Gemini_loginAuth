import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCellEditable } from './cellLock.ts';

const grants = [{ day: 'mon', projectId: 'pA' }] as const;

test('today is always editable', () => {
  assert.equal(isCellEditable('wed', 'pA', 'wed', []), true);
});

test('a granted past day for the row project is editable', () => {
  assert.equal(isCellEditable('mon', 'pA', 'wed', grants as never), true);
});

test('a granted day for a different project is not editable', () => {
  assert.equal(isCellEditable('mon', 'pB', 'wed', grants as never), false);
});

test('ad-hoc (no project) past day is not editable', () => {
  assert.equal(isCellEditable('mon', null, 'wed', grants as never), false);
});

test('a non-today, non-granted day is locked', () => {
  assert.equal(isCellEditable('tue', 'pA', 'wed', grants as never), false);
});
