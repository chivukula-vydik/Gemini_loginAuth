import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, dueUrgency, dueLabel } from './due.ts';

const TODAY = '2026-06-17';

test('daysUntil: signed day difference', () => {
  assert.equal(daysUntil('2026-06-17', TODAY), 0);
  assert.equal(daysUntil('2026-06-20', TODAY), 3);
  assert.equal(daysUntil('2026-06-15', TODAY), -2);
});

test('dueUrgency: overdue when past and not done', () => {
  assert.equal(dueUrgency('2026-06-16', TODAY, 'in_progress'), 'overdue');
});

test('dueUrgency: soon within threshold', () => {
  assert.equal(dueUrgency('2026-06-17', TODAY, 'todo'), 'soon');
  assert.equal(dueUrgency('2026-06-20', TODAY, 'todo'), 'soon');
});

test('dueUrgency: ok when comfortably ahead', () => {
  assert.equal(dueUrgency('2026-06-25', TODAY, 'todo'), 'ok');
});

test('dueUrgency: done tasks are never urgent', () => {
  assert.equal(dueUrgency('2026-06-01', TODAY, 'done'), 'ok');
});

test('dueUrgency: null when no due date', () => {
  assert.equal(dueUrgency(null, TODAY, 'todo'), null);
  assert.equal(dueUrgency(undefined, TODAY, 'todo'), null);
});

test('dueUrgency: custom soonDays threshold', () => {
  assert.equal(dueUrgency('2026-06-22', TODAY, 'todo', 7), 'soon');
  assert.equal(dueUrgency('2026-06-22', TODAY, 'todo', 3), 'ok');
});

test('dueLabel: human-readable relative deadline', () => {
  assert.equal(dueLabel('2026-06-15', TODAY), '2d overdue');
  assert.equal(dueLabel('2026-06-17', TODAY), 'due today');
  assert.equal(dueLabel('2026-06-18', TODAY), 'due tomorrow');
  assert.equal(dueLabel('2026-06-20', TODAY), '3d left');
});
