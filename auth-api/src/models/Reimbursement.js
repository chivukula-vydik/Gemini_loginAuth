import mongoose from 'mongoose';

const ReimbursementSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category:    { type: String, enum: ['travel', 'food', 'internet', 'medical', 'other'], required: true },
  amount:      { type: Number, required: true },
  claimDate:   { type: String, required: true },
  description: { type: String, default: '' },
  attachments: [{ url: String, filename: String }],

  status:    { type: String, enum: ['submitted', 'approved', 'rejected', 'paid'], default: 'submitted', index: true },
  approver:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', default: null },
  taxable:    { type: Boolean, default: false },
}, { timestamps: true });

export const Reimbursement = mongoose.model('Reimbursement', ReimbursementSchema);
