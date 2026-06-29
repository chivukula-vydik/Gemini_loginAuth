import { computePF, computeESIC, computePT, computeMonthlyTDS, computeAnnualTax } from './statutoryEngine.js';

export function resolveMonthlyAmounts(components, ctcAnnual) {
  const basicComp = components.find(c => c.key === 'basic');
  const annualBasic = basicComp ? basicComp.value : 0;
  const monthlyBasic = annualBasic / 12;

  let allocatedAnnual = 0;
  let balancingIndex = -1;

  const resolved = components.map((comp, i) => {
    let monthlyAmount;
    if (comp.calc === 'balancing') {
      balancingIndex = i;
      monthlyAmount = 0;
    } else if (comp.calc === 'fixed') {
      monthlyAmount = comp.value / 12;
    } else if (comp.calc === 'percent_of_basic') {
      monthlyAmount = (comp.value / 100) * monthlyBasic;
    } else if (comp.calc === 'percent_of_ctc') {
      monthlyAmount = (comp.value / 100) * ctcAnnual / 12;
    } else {
      monthlyAmount = 0;
    }

    monthlyAmount = Math.round(monthlyAmount * 100) / 100;
    if (comp.calc !== 'balancing') allocatedAnnual += monthlyAmount * 12;

    return {
      key: comp.key,
      label: comp.label,
      type: comp.type,
      monthlyAmount,
      taxable: comp.taxable ?? true,
      proratable: comp.proratable ?? true,
      employerSide: comp.employerSide ?? false,
      partOfPfWage: comp.partOfPfWage ?? false,
    };
  });

  if (balancingIndex >= 0) {
    const remainder = Math.max(0, ctcAnnual - allocatedAnnual);
    resolved[balancingIndex].monthlyAmount = Math.round((remainder / 12) * 100) / 100;
  }

  return resolved;
}

export function buildPayslip({ components, ctcAnnual, input, statutoryConfig, regime, declarations, reimbursements, loanEmis, tdsPaidYTD, monthsRemaining }) {
  const resolved = resolveMonthlyAmounts(components, ctcAnnual);
  const { payableDays, lopDays, otHours, billableHours } = input;
  const paidDays = payableDays - lopDays;

  const earnings = [];
  let grossEarnings = 0;

  for (const comp of resolved) {
    if (comp.type !== 'earning') continue;
    if (comp.employerSide) continue;
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

/**
 * Estimate mode for the candidate portal offer breakdown.
 * Same resolver + engine, new regime, no declarations, first month of FY.
 */
export function computeOfferBreakdown(components, ctcAnnual, statutoryConfig) {
  const resolved = resolveMonthlyAmounts(components, ctcAnnual);

  const monthlyEarnings = [];
  let grossMonthly = 0;
  const employerContributions = [];

  for (const comp of resolved) {
    if (comp.type !== 'earning') continue;
    const line = { key: comp.key, label: comp.label, amount: comp.monthlyAmount };
    if (comp.employerSide) {
      employerContributions.push(line);
    } else {
      monthlyEarnings.push(line);
      grossMonthly += comp.monthlyAmount;
    }
  }

  const basicComp = monthlyEarnings.find(e => e.key === 'basic');
  const basicMonthly = basicComp ? basicComp.amount : 0;

  const pf = computePF(basicMonthly, statutoryConfig.pf);
  const esic = computeESIC(grossMonthly, statutoryConfig.esic);
  const ptSlabs = statutoryConfig.pt || [];
  const pt = computePT(grossMonthly, ptSlabs);

  const regimeConfig = statutoryConfig.tds?.new;
  let estimatedTdsMonthly = 0;
  if (regimeConfig) {
    const { tax: annualTax } = computeAnnualTax(grossMonthly * 12, regimeConfig, []);
    estimatedTdsMonthly = Math.round(annualTax / 12);
  }

  const estimatedDeductions = [
    { key: 'employee_pf', label: 'Employee PF', amount: pf.employee },
    ...(esic.employee > 0 ? [{ key: 'employee_esic', label: 'Employee ESI', amount: esic.employee }] : []),
    { key: 'professional_tax', label: 'Professional Tax', amount: pt },
    { key: 'estimated_tds', label: 'Estimated TDS (new regime)', amount: estimatedTdsMonthly, isEstimate: true },
  ];

  const totalDeductionsMonthly = estimatedDeductions.reduce((s, d) => s + d.amount, 0);
  const estimatedInHandMonthly = Math.round((grossMonthly - totalDeductionsMonthly) * 100) / 100;

  return {
    ctcAnnual,
    grossMonthly: Math.round(grossMonthly * 100) / 100,
    grossAnnual: Math.round(grossMonthly * 12 * 100) / 100,
    monthlyEarnings,
    employerContributions,
    estimatedDeductions,
    estimatedInHandMonthly,
    estimatedInHandAnnual: Math.round(estimatedInHandMonthly * 12 * 100) / 100,
    disclaimer: 'Estimate based on new tax regime with no investment declarations. Final TDS will be set after you join and choose your regime.',
  };
}
