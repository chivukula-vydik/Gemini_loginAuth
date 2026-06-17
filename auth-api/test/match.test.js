import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillsMatch } from '../src/services/match.js';

test('skillsMatch: no required skills means open to everyone', () => {
  assert.equal(skillsMatch([], ['a', 'b']), true);
  assert.equal(skillsMatch([], []), true);
});

test('skillsMatch: overlap returns true', () => {
  assert.equal(skillsMatch(['a', 'c'], ['c', 'd']), true);
});

test('skillsMatch: disjoint returns false', () => {
  assert.equal(skillsMatch(['a', 'b'], ['c', 'd']), false);
  assert.equal(skillsMatch(['a'], []), false);
});
