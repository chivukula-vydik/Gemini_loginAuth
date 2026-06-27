import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMonthlyAmounts } from '../src/services/payrollEngine.js';

test('resolveMonthlyAmounts: fixed components return value / 12', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
  ];
  const result = resolveMonthlyAmounts(components, 1200000);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'basic');
  assert.equal(result[0].monthlyAmount, 50000);
});

test('resolveMonthlyAmounts: percent_of_basic uses basic value', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
    { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
  ];
  const result = resolveMonthlyAmounts(components, 1200000);
  const hra = result.find(c => c.key === 'hra');
  assert.equal(hra.monthlyAmount, 25000); // 50% of 50000
});

test('resolveMonthlyAmounts: percent_of_ctc uses annual CTC', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
    { key: 'pf_employer', label: 'PF Employer', type: 'deduction', calc: 'percent_of_ctc', value: 12, taxable: false, proratable: true },
  ];
  const result = resolveMonthlyAmounts(components, 1200000);
  const pf = result.find(c => c.key === 'pf_employer');
  assert.equal(pf.monthlyAmount, 12000); // 12% of 1200000 / 12
});
