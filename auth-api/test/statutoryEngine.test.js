import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePF, computeESIC, computePT, computeMonthlyTDS } from '../src/services/statutoryEngine.js';

const pfConfig = { employeePct: 12, employerPct: 12, wageCeiling: 15000 };
const esicConfig = { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 };
const ptSlabs = [
  { upTo: 15000, amount: 0 },
  { upTo: 20000, amount: 150 },
  { upTo: Infinity, amount: 200 },
];

test('computePF: basic below wage ceiling', () => {
  const result = computePF(12000, pfConfig);
  assert.equal(result.employee, 1440);
  assert.equal(result.employer, 1440);
});

test('computePF: basic above wage ceiling caps at ceiling', () => {
  const result = computePF(50000, pfConfig);
  assert.equal(result.employee, 1800);
  assert.equal(result.employer, 1800);
});

test('computeESIC: gross below ceiling applies', () => {
  const result = computeESIC(18000, esicConfig);
  assert.equal(result.employee, 135);
  assert.equal(result.employer, 585);
});

test('computeESIC: gross above ceiling returns zero', () => {
  const result = computeESIC(25000, esicConfig);
  assert.equal(result.employee, 0);
  assert.equal(result.employer, 0);
});

test('computePT: gross 18000 falls in 150 slab', () => {
  assert.equal(computePT(18000, ptSlabs), 150);
});

test('computePT: gross 25000 falls in 200 slab', () => {
  assert.equal(computePT(25000, ptSlabs), 200);
});

test('computePT: gross 10000 falls in 0 slab', () => {
  assert.equal(computePT(10000, ptSlabs), 0);
});

const newSlabs = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 5 },
  { upTo: 1200000, rate: 10 },
  { upTo: 1600000, rate: 15 },
  { upTo: 2000000, rate: 20 },
  { upTo: 2400000, rate: 25 },
  { upTo: Infinity, rate: 30 },
];

test('computeMonthlyTDS: new regime, 12L annual taxable, standard deduction 75k', () => {
  const monthlyTds = computeMonthlyTDS({
    annualGross: 1200000,
    regime: 'new',
    slabs: newSlabs,
    standardDeduction: 75000,
    declarations: [],
  });
  // taxable = 1200000 - 75000 = 1125000
  // 0-4L: 0, 4-8L: 20000, 8-11.25L: 32500 = 52500 annual
  // monthly = 52500 / 12 = 4375
  assert.equal(monthlyTds, 4375);
});

const oldSlabs = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 5 },
  { upTo: 1000000, rate: 20 },
  { upTo: Infinity, rate: 30 },
];

test('computeMonthlyTDS: old regime with 80C deduction', () => {
  const monthlyTds = computeMonthlyTDS({
    annualGross: 1200000,
    regime: 'old',
    slabs: oldSlabs,
    standardDeduction: 50000,
    declarations: [{ section: '80C', declaredAmount: 150000 }],
  });
  // taxable = 1200000 - 50000 - 150000 = 1000000
  // 0-2.5L: 0, 2.5-5L: 12500, 5-10L: 100000 = 112500 annual
  // monthly = 112500 / 12 = 9375
  assert.equal(monthlyTds, 9375);
});
