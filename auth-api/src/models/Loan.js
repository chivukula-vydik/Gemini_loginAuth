import mongoose from 'mongoose';

const EMIScheduleSchema = new mongoose.Schema({
  period: {
    month: { type: Number, required: true },
    year:  { type: Number, required: true },
  },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['due', 'paid', 'skipped'], default: 'due' },
}, { _id: false });

const LOAN_TYPES = ['home_loan', 'education_loan', 'ev_loan', 'salary_advance', 'other'];
const TAX_DEDUCTIBLE_TYPES = ['home_loan', 'education_loan', 'ev_loan'];
const LOAN_TAX_SECTIONS = {
  home_loan:      ['24B', '80C'],
  education_loan: ['80E'],
  ev_loan:        ['80EEB'],
};

const LoanSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label:        { type: String, default: '' },
  loanType:     { type: String, enum: LOAN_TYPES, default: 'other' },
  principal:    { type: Number, required: true },
  emiAmount:    { type: Number, required: true },
  tenureMonths: { type: Number, required: true },
  schedule:     [EMIScheduleSchema],
  status:       { type: String, enum: ['active', 'closed', 'paused'], default: 'active' },
}, { timestamps: true });

LoanSchema.virtual('taxDeductible').get(function () {
  return TAX_DEDUCTIBLE_TYPES.includes(this.loanType);
});

LoanSchema.methods.checkAutoClose = function () {
  if (this.status === 'closed') return;
  const allPaid = this.schedule.every(e => e.status !== 'due');
  if (allPaid) this.status = 'closed';
};

export const Loan = mongoose.model('Loan', LoanSchema);
export { LOAN_TYPES, TAX_DEDUCTIBLE_TYPES, LOAN_TAX_SECTIONS };
