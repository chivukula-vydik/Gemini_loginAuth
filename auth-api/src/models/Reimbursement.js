import mongoose from 'mongoose';

const ApprovalStepSchema = new mongoose.Schema({
  role:       { type: String, enum: ['rm', 'pm', 'finance'], required: true },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action:     { type: String, enum: ['approved', 'rejected'], required: true },
  reason:     { type: String, default: '' },
  actedAt:    { type: Date, default: Date.now },
}, { _id: false });

const ReimbursementSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category:    { type: String, enum: ['travel', 'food', 'internet', 'medical', 'other'], required: true },
  amount:      { type: Number, required: true },
  claimDate:   { type: String, required: true },
  description: { type: String, default: '' },
  project:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  attachments: [{
    fileId:      { type: mongoose.Schema.Types.ObjectId },
    filename:    { type: String },
    contentType: { type: String },
    size:        { type: Number },
    uploadedAt:  { type: Date, default: Date.now },
  }],

  status:    { type: String, enum: ['submitted', 'rm_approved', 'pm_approved', 'approved', 'rejected', 'paid'], default: 'submitted', index: true },
  approvalTrail: [ApprovalStepSchema],
  rejectionReason: { type: String, default: '' },

  approvalRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRequest', default: null },
  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', default: null },
  taxable:    { type: Boolean, default: false },
}, { timestamps: true });

export const Reimbursement = mongoose.model('Reimbursement', ReimbursementSchema);
