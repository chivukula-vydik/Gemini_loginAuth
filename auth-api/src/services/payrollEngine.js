import { computePF, computeESIC, computePT, computeMonthlyTDS } from './statutoryEngine.js';

export function resolveMonthlyAmounts(components, ctcAnnual) {
  const basicComp = components.find(c => c.key === 'basic');
  const annualBasic = basicComp ? basicComp.value : 0;
  const monthlyBasic = annualBasic / 12;

  return components.map(comp => {
    let monthlyAmount;
    if (comp.calc === 'fixed') {
      monthlyAmount = comp.value / 12;
    } else if (comp.calc === 'percent_of_basic') {
      monthlyAmount = (comp.value / 100) * monthlyBasic;
    } else if (comp.calc === 'percent_of_ctc') {
      monthlyAmount = (comp.value / 100) * ctcAnnual / 12;
    } else {
      monthlyAmount = 0;
    }
    return {
      key: comp.key,
      label: comp.label,
      type: comp.type,
      monthlyAmount: Math.round(monthlyAmount * 100) / 100,
      taxable: comp.taxable,
      proratable: comp.proratable,
    };
  });
}

export function buildPayslip({ components, ctcAnnual, input, statutoryConfig, regime, declarations, reimbursements, loanEmis, tdsPaidYTD, monthsRemaining }) {
  const resolved = resolveMonthlyAmounts(components, ctcAnnual);
  const { payableDays, lopDays, otHours, billableHours } = input;
  const paidDays = payableDays - lopDays;

  const earnings = [];
  let grossEarnings = 0;

  for (const comp of resolved) {
    if (comp.type !== 'earning') continue;
    let amount = comp.monthlyAmount;
    if (comp.proratable && payableDays > 0 && lopDays > 0) {
      amount = Math.round((amount * paidDays / payableDays) * 100) / 100;
    }
    earnings.push({ key: comp.key, label: comp.label, amount });
    grossEarnings += amount;
  }

  const reimbursementLines = reimbursements.map(r => ({
    key: `reimb_${r.category || r._id}`,
    label: `Reimbursement - ${r.category || 'Other'}`,
    amount: r.amount,
  }));
  const reimbTotal = reimbursementLines.reduce((s, r) => s + r.amount, 0);

  const basicEarning = earnings.find(e => e.key === 'basic');
  const basicMonthly = basicEarning ? basicEarning.amount : 0;

  const pf = computePF(basicMonthly, statutoryConfig.pf);
  const esic = computeESIC(grossEarnings, statutoryConfig.esic);
  const ptSlabs = statutoryConfig.pt || [];
  const pt = computePT(grossEarnings, ptSlabs);

  const ruleset = { fy: statutoryConfig.fy || '', regimes: { old: statutoryConfig.tds.old, new: statutoryConfig.tds.new } };
  const tds = computeMonthlyTDS({
    grossAnnual: grossEarnings * 12,
    regime,
    ruleset,
    declarations: declarations || [],
    tdsPaidYTD: tdsPaidYTD || 0,
    monthsRemaining: monthsRemaining || 12,
  });

  const deductions = [];

  const compDeductions = resolved.filter(c => c.type === 'deduction');
  for (const comp of compDeductions) {
    let amount = comp.monthlyAmount;
    if (comp.proratable && payableDays > 0 && lopDays > 0) {
      amount = Math.round((amount * paidDays / payableDays) * 100) / 100;
    }
    deductions.push({ key: comp.key, label: comp.label, amount });
  }

  for (const emi of loanEmis) {
    deductions.push({ key: 'loan_emi', label: emi.label || 'Loan EMI', amount: emi.amount });
  }

  const statutoryDeductions = pf.employee + esic.employee + pt + tds;
  const compDeductionTotal = deductions.reduce((s, d) => s + d.amount, 0);
  const totalDeductions = statutoryDeductions + compDeductionTotal;
  const gross = grossEarnings + reimbTotal;
  const netPay = Math.round((gross - totalDeductions) * 100) / 100;

  return {
    earnings,
    deductions,
    reimbursements: reimbursementLines,
    statutory: { pf: pf.employee, esic: esic.employee, pt, tds },
    gross: Math.round(gross * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay,
    lopDays,
    paidDays,
    otHours,
    billableHours,
  };
}
