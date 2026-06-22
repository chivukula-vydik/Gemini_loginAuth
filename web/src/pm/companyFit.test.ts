import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyFit, RELIABILITY_LABEL, type Reputation } from './companyFit.ts';

function rep(over: Partial<Reputation> = {}): Reputation {
  return {
    _id: 'u', displayName: 'U', email: 'u@x.io', role: 'employee',
    reestimations: { total: 0, approved: 0, rejected: 0, pending: 0 },
    direction: { under: 0, over: 0, same: 0 },
    completion: { done: 0, assigned: 0, rate: 0 },
    onTime: { measured: 0, onTime: 0, rate: null, avgDelayDays: null },
    ...over,
  };
}

test('no signal is neutral reliable', () => {
  assert.equal(companyFit(rep()), 'reliable');
});

test('clean record is reliable', () => {
  assert.equal(companyFit(rep({
    reestimations: { total: 1, approved: 1, rejected: 0, pending: 0 },
    completion: { done: 8, assigned: 10, rate: 0.8 },
    onTime: { measured: 6, onTime: 5, rate: 0.83, avgDelayDays: 0.2 },
  })), 'reliable');
});

test('one strike is mixed', () => {
  assert.equal(companyFit(rep({
    reestimations: { total: 4, approved: 2, rejected: 2, pending: 0 }, // frequent re-estimator
    completion: { done: 8, assigned: 10, rate: 0.8 },
    onTime: { measured: 6, onTime: 5, rate: 0.83, avgDelayDays: 0.2 },
  })), 'mixed');
});

test('two or more strikes is unreliable', () => {
  assert.equal(companyFit(rep({
    reestimations: { total: 5, approved: 1, rejected: 4, pending: 0 }, // strike
    completion: { done: 1, assigned: 5, rate: 0.2 },                    // strike
    onTime: { measured: 4, onTime: 1, rate: 0.25, avgDelayDays: 3 },    // strike
  })), 'unreliable');
});

test('labels exist for every verdict', () => {
  assert.equal(RELIABILITY_LABEL.reliable, 'Reliable');
  assert.equal(RELIABILITY_LABEL.mixed, 'Mixed');
  assert.equal(RELIABILITY_LABEL.unreliable, 'Unreliable');
});
