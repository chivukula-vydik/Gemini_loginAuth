// auth-api/test/payrollEngine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayslip } from '../src/services/payrollEngine.js';

test('buildPayslip: prorates proratable earnings by LOP', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
    { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
    { key: 'special', label: 'Special', type: 'earning', calc: 'fixed', value: 120000, taxable: true, proratable: false },
  ];
  const input = { payableDays: 22, lopDays: 2, presentDays: 19, paidLeaveDays: 1, otHours: 0, billableHours: 10 };
  const statutory = { pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 }, esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 }, pt: [], tds: { new: { slabs: [{ upTo: 400000, rate: 0 }, { upTo: Infinity, rate: 5 }], standardDeduction: 75000 } } };
  const slip = buildPayslip({
    components,
    ctcAnnual: 1200000,
    input,
    statutoryConfig: statutory,
    regime: 'new',
    declarations: [],
    reimbursements: [],
    loanEmis: [],
  });

  // basic monthly = 50000, prorated = 50000 * (22-2)/22 = 45454.55
  assert.ok(slip.earnings.length >= 2);
  const basic = slip.earnings.find(e => e.key === 'basic');
  assert.equal(basic.amount, 45454.55);

  // special is not proratable: 120000/12 = 10000 stays 10000
  const special = slip.earnings.find(e => e.key === 'special');
  assert.equal(special.amount, 10000);

  assert.equal(slip.lopDays, 2);
  assert.equal(slip.paidDays, 20);
  assert.ok(slip.gross > 0);
  assert.ok(slip.netPay > 0);
  assert.ok(slip.netPay <= slip.gross);
});

test('buildPayslip: reimbursements added as earning lines', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
  ];
  const input = { payableDays: 22, lopDays: 0, presentDays: 22, paidLeaveDays: 0, otHours: 0, billableHours: 0 };
  const statutory = { pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 }, esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 }, pt: [], tds: { new: { slabs: [{ upTo: Infinity, rate: 0 }], standardDeduction: 75000 } } };
  const reimbursements = [
    { _id: 'r1', category: 'travel', amount: 5000 },
  ];
  const slip = buildPayslip({
    components,
    ctcAnnual: 600000,
    input,
    statutoryConfig: statutory,
    regime: 'new',
    declarations: [],
    reimbursements,
    loanEmis: [],
  });

  assert.equal(slip.reimbursements.length, 1);
  assert.equal(slip.reimbursements[0].amount, 5000);
});

test('buildPayslip: loan EMIs appear as deductions', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
  ];
  const input = { payableDays: 22, lopDays: 0, presentDays: 22, paidLeaveDays: 0, otHours: 0, billableHours: 0 };
  const statutory = { pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 }, esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 }, pt: [], tds: { new: { slabs: [{ upTo: Infinity, rate: 0 }], standardDeduction: 75000 } } };
  const loanEmis = [{ amount: 3000, label: 'Personal Loan EMI' }];
  const slip = buildPayslip({
    components,
    ctcAnnual: 600000,
    input,
    statutoryConfig: statutory,
    regime: 'new',
    declarations: [],
    reimbursements: [],
    loanEmis,
  });

  const loanDed = slip.deductions.find(d => d.key === 'loan_emi');
  assert.ok(loanDed);
  assert.equal(loanDed.amount, 3000);
});
