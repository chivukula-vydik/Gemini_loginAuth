import mongoose from 'mongoose';

const conditionSchema = new mongoose.Schema({
  field: { type: String, required: true },
  op: { type: String, enum: ['gt', 'gte', 'lt', 'lte', 'eq'], required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
}, { _id: false });

const approvalStepSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  name: { type: String, required: true },
  approverType: { type: String, enum: ['user', 'role', 'manager'], required: true },
  approvers: { type: [String], default: [] },
  rule: { type: String, enum: ['all', 'any'], default: 'any' },
}, { _id: false });

const approvalFlowSchema = new mongoose.Schema({
  name: { type: String, required: true },
  appliesTo: {
    entityType: { type: String, required: true },
    condition: { type: conditionSchema, default: null },
  },
  steps: { type: [approvalStepSchema], default: [] },
  priority: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now },
});

approvalFlowSchema.index({ 'appliesTo.entityType': 1, active: 1, priority: 1 });

export const ApprovalFlow = mongoose.model('ApprovalFlow', approvalFlowSchema);
