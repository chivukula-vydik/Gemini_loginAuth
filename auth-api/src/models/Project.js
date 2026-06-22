import mongoose from 'mongoose';

// Persistent allocation of a member's time on this project — separate from
// Task.assignees[].sharePct, which only describes split of work on one task.
const allocationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    allocationPct: { type: Number, min: 25, max: 100, default: 100 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    billingRole: { type: String, default: '' },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // No default: an explicit `null` would still be indexed by the sparse
  // unique index below, causing a duplicate-key error across multiple
  // code-less projects. Leaving the field entirely unset is what lets the
  // sparse index skip it.
  projectCode: { type: String, trim: true, uppercase: true },
  description: { type: String, default: '' },
  ownerPm: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  allocations: { type: [allocationSchema], default: [] },
  requiredSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  startDate: { type: Date, default: null },
  targetDate: { type: Date, default: null },
  billing: {
    type: { type: String, enum: ['hourly', 'fixed', 'milestone'], default: 'hourly' },
    allowExpenses: { type: Boolean, default: false },
  },
  createdAt: { type: Date, default: Date.now },
});

// Sparse so existing/blank codes don't collide on null, but a given code can only be used once.
projectSchema.index({ projectCode: 1 }, { unique: true, sparse: true });

export const Project = mongoose.model('Project', projectSchema);
