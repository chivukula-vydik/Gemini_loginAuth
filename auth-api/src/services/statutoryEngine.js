export function computePF(basicMonthly, config) {
  const base = Math.min(basicMonthly, config.wageCeiling);
  return {
    employee: Math.round(base * config.employeePct / 100),
    employer: Math.round(base * config.employerPct / 100),
  };
}

export function computeESIC(grossMonthly, config) {
  if (grossMonthly > config.grossCeiling) {
    return { employee: 0, employer: 0 };
  }
  return {
    employee: Math.round(grossMonthly * config.employeePct / 100),
    employer: Math.round(grossMonthly * config.employerPct / 100),
  };
}

export function computePT(grossMonthly, slabs) {
  for (const slab of slabs) {
    if (grossMonthly <= slab.upTo) return slab.amount;
  }
  return slabs[slabs.length - 1]?.amount || 0;
}

function slabTax(taxableIncome, slabs) {
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxableIncome <= prev) break;
    const taxableInSlab = Math.min(taxableIncome, slab.upTo) - prev;
    tax += taxableInSlab * slab.rate / 100;
    prev = slab.upTo;
  }
  return Math.round(tax);
}

export function computeMonthlyTDS({ annualGross, regime, slabs, standardDeduction, declarations }) {
  let taxableIncome = annualGross - standardDeduction;

  if (regime === 'old' && declarations?.length) {
    const totalDeductions = declarations.reduce((sum, d) => sum + (d.declaredAmount || 0), 0);
    taxableIncome -= totalDeductions;
  }

  taxableIncome = Math.max(0, taxableIncome);
  const annualTax = slabTax(taxableIncome, slabs);
  return Math.round(annualTax / 12);
}
