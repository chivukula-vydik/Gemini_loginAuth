import mongoose from 'mongoose';

const phaseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  order: { type: Number, default: 0 },
  status: { type: String, enum: ['upcoming', 'active', 'completed'], default: 'upcoming' },
}, { _id: true });

const milestoneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  amount: { type: Number, default: 0 },
  description: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'paid'], default: 'pending' },
}, { _id: true });

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  ownerPm: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  requiredSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  startDate: { type: Date, default: null },
  targetDate: { type: Date, default: null },
  clientName: { type: String, default: '', trim: true },
  billingType: { type: String, enum: ['billable', 'non-billable', 'milestone', 'hourly', 'fixed-price'], default: 'non-billable' },
  billingRate: { type: Number, default: null },
  currency: { type: String, default: null },
  milestones: { type: [milestoneSchema], default: [] },
  phases: { type: [phaseSchema], default: [] },
  activePhase: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Project = mongoose.model('Project', projectSchema);
