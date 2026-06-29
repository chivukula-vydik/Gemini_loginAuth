import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePF, computeESIC, computePT,
  computeAnnualTax, computeMonthlyTDS,
} from './statutoryEngine.js';

// ── FY 2026-27 ruleset (the engine reads this, not hardcoded slabs) ─────
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

// ── PF ──────────────────────────────────────────────────────────────────
describe('computePF', () => {
  const cfg = { employeePct: 12, employerPct: 12, wageCeiling: 15000 };

  it('caps at wage ceiling', () => {
    const r = computePF(50000, cfg);
    assert.equal(r.employee, 1800); // 12% of 15000
    assert.equal(r.employer, 1800);
  });

  it('uses actual basic when below ceiling', () => {
    const r = computePF(10000, cfg);
    assert.equal(r.employee, 1200);
    assert.equal(r.employer, 1200);
  });
});

// ── ESIC ────────────────────────────────────────────────────────────────
describe('computeESIC', () => {
  const cfg = { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 };

  it('returns zero above ceiling', () => {
    const r = computeESIC(25000, cfg);
    assert.equal(r.employee, 0);
    assert.equal(r.employer, 0);
  });

  it('computes below ceiling', () => {
    const r = computeESIC(20000, cfg);
    assert.equal(r.employee, 150);  // 0.75% of 20000
    assert.equal(r.employer, 650);  // 3.25% of 20000
  });
});

// ── PT ──────────────────────────────────────────────────────────────────
describe('computePT', () => {
  const slabs = [
    { upTo: 15000, amount: 0 },
    { upTo: 20000, amount: 150 },
    { upTo: Infinity, amount: 200 },
  ];

  it('returns 0 below first slab', () => {
    assert.equal(computePT(10000, slabs), 0);
  });

  it('returns slab amount', () => {
    assert.equal(computePT(18000, slabs), 150);
  });

  it('returns highest slab for high earners', () => {
    assert.equal(computePT(100000, slabs), 200);
  });
});

// ── Annual tax — NEW regime ─────────────────────────────────────────────
describe('computeAnnualTax — new regime FY2627', () => {
  const regime = FY2627.regimes.new;

  it('zero tax at ₹10L gross (under 12.75L effective)', () => {
    // taxable = 10,00,000 - 75,000 = 9,25,000
    // slab tax = 0 + 20000 + 12500 = 32,500
    // taxable ≤ 12L → rebate wipes it
    const r = computeAnnualTax(1000000, regime, []);
    assert.equal(r.tax, 0);
  });

  it('zero tax at ₹12,75,000 gross (rebate boundary)', () => {
    // taxable = 12,75,000 - 75,000 = 12,00,000 → exactly at rebate limit
    const r = computeAnnualTax(1275000, regime, []);
    assert.equal(r.tax, 0);
  });

  it('marginal relief at ₹12,85,000 gross (just over the cliff)', () => {
    // taxable = 12,85,000 - 75,000 = 12,10,000
    // slab tax = 0 + 20000 + 40000 + 1500 = 61,500
    // no rebate (taxable > 12L)
    // marginal relief: tax capped at taxable - 12,00,000 = 10,000
    // cess = 10,000 * 0.04 = 400
    // total = 10,400
    const r = computeAnnualTax(1285000, regime, []);
    assert.equal(r.tax, 10400);
  });

  it('₹12,10,000 taxable → tax capped at ₹10,000 + cess (the exact spec case)', () => {
    // Feed taxable directly: gross = 12,10,000 + 75,000 = 12,85,000
    const r = computeAnnualTax(1285000, regime, []);
    // pre-cess should be 10,000, total 10,400
    assert.equal(r.tax, 10400);
    assert.equal(r.preCessTax, 10000);
  });

  it('normal tax at ₹20L gross (well past cliff)', () => {
    // taxable = 20,00,000 - 75,000 = 19,25,000
    // slab: 0 + 20000 + 40000 + 60000 + 65000 = 1,85,000 (0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-19.25L 20%)
    // no rebate, no surcharge (under 50L)
    // cess = 1,85,000 * 0.04 = 7,400
    // total = 1,92,400
    const r = computeAnnualTax(2000000, regime, []);
    assert.equal(r.slabTax, 185000);
    assert.equal(r.tax, 192400);
  });

  it('₹45L CTC case (spec worked example)', () => {
    // From spec: gross monthly 3,49,785, annual gross = 41,97,420
    // But we need to feed gross earnings not CTC. With employer side excluded,
    // gross = CTC - employer PF - gratuity = 45,00,000 - 2,16,000 - 86,580 = 41,97,420
    // taxable = 41,97,420 - 75,000 = 41,22,420
    // slab: 0 + 20000 + 40000 + 60000 + 80000 + 100000 + 5,16,726 = 8,16,726
    // no surcharge (under 50L), cess = 8,16,726 * 0.04 = 32,669
    // total = 8,49,395 → monthly ~70,783
    const grossAnnual = 4197420;
    const r = computeAnnualTax(grossAnnual, regime, []);
    const monthlyTDS = Math.round(r.tax / 12);
    // The spec says ~70,783/month
    assert.ok(Math.abs(monthlyTDS - 70783) < 100, `monthly TDS ${monthlyTDS} should be ~70,783`);
  });

  it('surcharge kicks in above ₹50L', () => {
    // taxable = 60,00,000 - 75,000 = 59,25,000
    // slab tax: 0 + 20000 + 40000 + 60000 + 80000 + 100000 + 10*30% = 11,77,500
    // wait: 0-4L nil, 4-8L 5%=20k, 8-12L 10%=40k, 12-16L 15%=60k, 16-20L 20%=80k, 20-24L 25%=100k, 24-59.25L=35.25L*30%=10,57,500
    // total slab = 0+20000+40000+60000+80000+100000+1057500 = 13,57,500
    // surcharge: taxable 59,25,000 > 50L → 10% = 1,35,750
    // but check marginal relief on surcharge: tax without surcharge = 13,57,500
    // tax with surcharge = 13,57,500 + 1,35,750 = 14,93,250
    // income over 50L = 9,25,000. Extra tax from surcharge = 1,35,750.
    // marginal relief: surcharge can't exceed income over threshold...
    // Actually surcharge marginal relief: total tax+surcharge should not exceed
    // (tax at threshold) + (income over threshold).
    // At 50L taxable: slab = 0+20000+40000+60000+80000+100000+780000=10,80,000
    // income over 50L = 9,25,000
    // max surcharge = 9,25,000 - (13,57,500 - 10,80,000) = 9,25,000 - 2,77,500 = 6,47,500
    // actual surcharge = 1,35,750 which is less → no relief needed
    // pre-cess = 13,57,500 + 1,35,750 = 14,93,250
    // cess = 14,93,250 * 0.04 = 59,730
    // total = 15,52,980
    const r = computeAnnualTax(6000000, regime, []);
    assert.equal(r.surcharge > 0, true);
    assert.equal(r.cess > 0, true);
  });
});

// ── Annual tax — OLD regime ─────────────────────────────────────────────
describe('computeAnnualTax — old regime FY2627', () => {
  const regime = FY2627.regimes.old;

  it('zero tax at ₹5L gross with no declarations', () => {
    // taxable = 5,00,000 - 50,000 = 4,50,000
    // slab: 0 + (4,50,000-2,50,000)*5% = 10,000
    // rebate: taxable ≤ 5L → rebate up to 12,500 → tax = 0
    const r = computeAnnualTax(500000, regime, []);
    assert.equal(r.tax, 0);
  });

  it('applies 80C declarations', () => {
    // gross = 12,00,000, 80C = 1,50,000
    // taxable = 12,00,000 - 50,000 - 1,50,000 = 10,00,000
    // slab: 0 + 12,500 + 1,00,000 = 1,12,500
    // no rebate (taxable > 5L)
    // cess = 1,12,500 * 0.04 = 4,500
    // total = 1,17,000
    const r = computeAnnualTax(1200000, regime, [{ section: '80C', declaredAmount: 150000 }]);
    assert.equal(r.slabTax, 112500);
    assert.equal(r.tax, 117000);
  });
});

// ── Monthly TDS (YTD-aware) ─────────────────────────────────────────────
describe('computeMonthlyTDS — YTD-aware', () => {
  const ruleset = FY2627;

  it('first month of FY divides annual by 12', () => {
    const tds = computeMonthlyTDS({
      grossAnnual: 2000000,
      regime: 'new',
      ruleset,
      declarations: [],
      tdsPaidYTD: 0,
      monthsRemaining: 12,
    });
    // annual tax = 192400 (from test above), monthly = 192400/12 = 16033
    assert.equal(tds, Math.round(192400 / 12));
  });

  it('adjusts for YTD payments mid-year', () => {
    // 6 months in, paid 96200 so far (half of 192400)
    const tds = computeMonthlyTDS({
      grossAnnual: 2000000,
      regime: 'new',
      ruleset,
      declarations: [],
      tdsPaidYTD: 96200,
      monthsRemaining: 6,
    });
    // remaining = 192400 - 96200 = 96200, spread over 6 = 16033
    assert.equal(tds, Math.round(96200 / 6));
  });

  it('returns 0 when overpaid', () => {
    const tds = computeMonthlyTDS({
      grossAnnual: 1000000,
      regime: 'new',
      ruleset,
      declarations: [],
      tdsPaidYTD: 999999,
      monthsRemaining: 1,
    });
    assert.equal(tds, 0);
  });
});
