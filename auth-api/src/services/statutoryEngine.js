// ── PF ──────────────────────────────────────────────────────────────────
export function computePF(basicMonthly, config) {
  const base = Math.min(basicMonthly, config.wageCeiling);
  return {
    employee: Math.round(base * config.employeePct / 100),
    employer: Math.round(base * config.employerPct / 100),
  };
}

// ── ESIC ────────────────────────────────────────────────────────────────
export function computeESIC(grossMonthly, config) {
  if (grossMonthly > config.grossCeiling) {
    return { employee: 0, employer: 0 };
  }
  return {
    employee: Math.round(grossMonthly * config.employeePct / 100),
    employer: Math.round(grossMonthly * config.employerPct / 100),
  };
}

// ── Professional tax ────────────────────────────────────────────────────
export function computePT(grossMonthly, slabs) {
  for (const slab of slabs) {
    if (grossMonthly <= slab.upTo) return slab.amount;
  }
  return slabs[slabs.length - 1]?.amount || 0;
}

// ── Slab tax (marginal, never flat) ─────────────────────────────────────
function applySlabs(taxable, slabs) {
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxable <= prev) break;
    const upper = slab.upTo === null ? taxable : slab.upTo;
    const taxableInSlab = Math.min(taxable, upper) - prev;
    tax += taxableInSlab * slab.rate / 100;
    prev = upper;
  }
  return Math.round(tax);
}

// ── Annual tax computation ──────────────────────────────────────────────
// This is the core: taxable → slabs → rebate (with marginal relief) →
// surcharge (with marginal relief) → cess. Order matters.
export function computeAnnualTax(grossAnnual, regime, declarations) {
  // 1. Taxable income
  let taxable = grossAnnual - regime.standardDeduction;

  if (declarations?.length) {
    const allowed = new Set(regime.allowedDeductions || []);
    for (const d of declarations) {
      if (allowed.has(d.section)) {
        taxable -= (d.declaredAmount || 0);
      }
    }
  }

  taxable = Math.max(0, taxable);

  // 2. Marginal slab tax
  const slabTax = applySlabs(taxable, regime.slabs);

  // 3. Rebate u/s 87A
  let taxAfterRebate = slabTax;
  if (regime.rebate && taxable <= regime.rebate.maxIncome) {
    taxAfterRebate = Math.max(0, slabTax - regime.rebate.maxRebate);
  }

  // Marginal relief near the rebate cliff: if taxable just exceeds the
  // rebate limit, cap tax so the person doesn't pay more than the excess.
  // E.g. ₹12,10,000 taxable → tax capped at ₹10,000, not ₹61,500.
  if (regime.rebate && taxable > regime.rebate.maxIncome) {
    const excessOverLimit = taxable - regime.rebate.maxIncome;
    taxAfterRebate = Math.min(taxAfterRebate, excessOverLimit);
  }

  // 4. Surcharge with marginal relief
  let surcharge = 0;
  if (regime.surcharge?.length && taxable > regime.surcharge[0]?.threshold) {
    surcharge = computeSurchargeWithRelief(taxable, taxAfterRebate, regime.surcharge, regime.slabs);
  }

  const preCessTax = taxAfterRebate + surcharge;

  // 5. Cess — always last, on (tax + surcharge)
  const cess = Math.round(preCessTax * (regime.cessRate || 0.04));
  const tax = preCessTax + cess;

  return { taxable, slabTax, taxAfterRebate, surcharge, preCessTax, cess, tax };
}

function computeSurchargeWithRelief(taxable, taxOnIncome, tiers, slabs) {
  let applicableRate = 0;
  let applicableThreshold = 0;

  for (const tier of tiers) {
    if (taxable > tier.threshold) {
      applicableRate = tier.rate;
      applicableThreshold = tier.threshold;
    }
  }

  if (applicableRate === 0) return 0;

  const surcharge = Math.round(taxOnIncome * applicableRate / 100);

  // Marginal relief on surcharge: total (tax+surcharge) must not exceed
  // (tax computed at the threshold) + (income above threshold)
  const taxAtThreshold = computeAnnualTax(applicableThreshold + (/* re-add stdDeduction for gross */ 0), {
    ...{ slabs, standardDeduction: 0, rebate: null, surcharge: [], cessRate: 0, allowedDeductions: [] },
  }, []);
  const slabTaxAtThreshold = applySlabs(applicableThreshold, slabs);
  const incomeOverThreshold = taxable - applicableThreshold;
  const maxTotal = slabTaxAtThreshold + incomeOverThreshold;

  if (taxOnIncome + surcharge > maxTotal) {
    return Math.max(0, maxTotal - taxOnIncome);
  }

  return surcharge;
}

// ── Monthly TDS (YTD-aware, recomputed each run) ────────────────────────
export function computeMonthlyTDS({ grossAnnual, regime, ruleset, declarations, tdsPaidYTD, monthsRemaining }) {
  const regimeConfig = ruleset.regimes[regime] || ruleset.regimes.new;
  const { tax: annualTax } = computeAnnualTax(grossAnnual, regimeConfig, declarations || []);

  const remaining = Math.max(0, annualTax - (tdsPaidYTD || 0));
  const months = Math.max(1, monthsRemaining || 1);

  return Math.max(0, Math.round(remaining / months));
}
