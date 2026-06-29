import mongoose from 'mongoose';

const EMIScheduleSchema = new mongoose.Schema({
  period: {
    month: { type: Number, required: true },
    year:  { type: Number, required: true },
  },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['due', 'paid', 'skipped'], default: 'due' },
}, { _id: false });

const LoanSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label:        { type: String, default: '' },
  principal:    { type: Number, required: true },
  emiAmount:    { type: Number, required: true },
  tenureMonths: { type: Number, required: true },
  schedule:     [EMIScheduleSchema],
  status:       { type: String, enum: ['active', 'closed', 'paused'], default: 'active' },
}, { timestamps: true });

LoanSchema.methods.checkAutoClose = function () {
  if (this.status === 'closed') return;
  const allPaid = this.schedule.every(e => e.status !== 'due');
  if (allPaid) this.status = 'closed';
};

export const Loan = mongoose.model('Loan', LoanSchema);
