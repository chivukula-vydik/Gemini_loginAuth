import mongoose from 'mongoose';

const decisionSchema = new mongoose.Schema({
  stepOrder: { type: Number, required: true },
  approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  decision: { type: String, enum: ['approve', 'reject'], required: true },
  comment: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}, { _id: false });

const snapshotStepSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  name: { type: String, required: true },
  approverType: { type: String },
  rule: { type: String, enum: ['all', 'any'], default: 'any' },
}, { _id: false });

const approvalRequestSchema = new mongoose.Schema({
  flowId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalFlow', required: true },
  entityType: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  snapshot: { type: [snapshotStepSchema], default: [] },
  resolvedApprovers: { type: Map, of: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: {} },

  currentStep: { type: Number, default: 1 },
  decisions: { type: [decisionSchema], default: [] },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
}, { timestamps: true });

approvalRequestSchema.index({ entityType: 1, entityId: 1 });
approvalRequestSchema.index({ status: 1 });

export const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);
