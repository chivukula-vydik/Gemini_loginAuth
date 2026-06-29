import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePF, computeESIC, computePT, computeMonthlyTDS, computeAnnualTax } from '../src/services/statutoryEngine.js';

const pfConfig = { employeePct: 12, employerPct: 12, wageCeiling: 15000 };
const esicConfig = { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 };
const ptSlabs = [
  { upTo: 15000, amount: 0 },
  { upTo: 20000, amount: 150 },
  { upTo: Infinity, amount: 200 },
];

const FY2627 = {
  fy: '2026-27',
  regimes: {
    new: {
      slabs: [
        { upTo: 400000, rate: 0 },
        { upTo: 800000, rate: 5 },
        { upTo: 1200000, rate: 10 },
        { upTo: 1600000, rate: 15 },
        { upTo: 2000000, rate: 20 },
        { upTo: 2400000, rate: 25 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 75000,
      rebate: { maxIncome: 1200000, maxRebate: 60000 },
      surcharge: [
        { threshold: 5000000, rate: 10 },
        { threshold: 10000000, rate: 15 },
        { threshold: 20000000, rate: 25 },
      ],
      cessRate: 0.04,
      allowedDeductions: ['80CCD(2)'],
    },
    old: {
      slabs: [
        { upTo: 250000, rate: 0 },
        { upTo: 500000, rate: 5 },
        { upTo: 1000000, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 50000,
      rebate: { maxIncome: 500000, maxRebate: 12500 },
      surcharge: [
        { threshold: 5000000, rate: 10 },
        { threshold: 10000000, rate: 15 },
        { threshold: 20000000, rate: 25 },
        { threshold: 50000000, rate: 37 },
      ],
      cessRate: 0.04,
      allowedDeductions: ['80C', '80D', '80CCD(1B)', '80CCD(2)', '24(b)'],
    },
  },
};

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

test('computeMonthlyTDS: new regime, 12L gross', () => {
  const monthlyTds = computeMonthlyTDS({
    grossAnnual: 1200000,
    regime: 'new',
    ruleset: FY2627,
    declarations: [],
    tdsPaidYTD: 0,
    monthsRemaining: 12,
  });
  // taxable = 1200000 - 75000 = 1125000 (under 12L rebate limit)
  // rebate wipes tax → 0
  assert.equal(monthlyTds, 0);
});

test('computeMonthlyTDS: old regime with 80C deduction', () => {
  const monthlyTds = computeMonthlyTDS({
    grossAnnual: 1200000,
    regime: 'old',
    ruleset: FY2627,
    declarations: [{ section: '80C', declaredAmount: 150000 }],
    tdsPaidYTD: 0,
    monthsRemaining: 12,
  });
  // taxable = 1200000 - 50000 - 150000 = 1000000
  // slab: 0 + 12500 + 100000 = 112500
  // no rebate (taxable > 5L)
  // cess = 112500 * 0.04 = 4500
  // annual = 117000, monthly = 117000 / 12 = 9750
  assert.equal(monthlyTds, Math.round(117000 / 12));
});
