import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectFit, TASK_LIMIT, FIT_LABEL, roleNote } from './projectFit.ts';

test('good: all skills, not busy, under task limit', () => {
  assert.equal(projectFit({ skillsOk: true, status: 'available', activeTaskCount: 2 }), 'good');
  assert.equal(projectFit({ skillsOk: true, status: 'standby', activeTaskCount: TASK_LIMIT - 1 }), 'good');
});

test('poor: missing skills AND overloaded', () => {
  assert.equal(projectFit({ skillsOk: false, status: 'busy', activeTaskCount: 1 }), 'poor');
  assert.equal(projectFit({ skillsOk: false, status: 'available', activeTaskCount: TASK_LIMIT }), 'poor');
});

test('ok: a single gap', () => {
  assert.equal(projectFit({ skillsOk: true, status: 'busy', activeTaskCount: 1 }), 'ok');
  assert.equal(projectFit({ skillsOk: false, status: 'available', activeTaskCount: 1 }), 'ok');
  assert.equal(projectFit({ skillsOk: true, status: 'available', activeTaskCount: TASK_LIMIT }), 'ok');
});

test('FIT_LABEL covers every verdict', () => {
  assert.equal(FIT_LABEL.good, 'Good fit');
  assert.equal(FIT_LABEL.ok, 'OK');
  assert.equal(FIT_LABEL.poor, 'Poor');
});

test('roleNote flags non-employees, null for employees', () => {
  assert.equal(roleNote('employee'), null);
  assert.equal(roleNote(undefined), null);
  assert.equal(roleNote('pm'), 'Adding a pm as a member');
  assert.equal(roleNote('admin'), 'Adding an admin as a member');
});
