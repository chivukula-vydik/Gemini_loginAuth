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
