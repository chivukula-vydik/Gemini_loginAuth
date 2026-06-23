import mongoose from 'mongoose';

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
  billingType: { type: String, enum: ['billable', 'non-billable'], default: 'non-billable' },
  billingRate: { type: Number, default: null },
  currency: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Project = mongoose.model('Project', projectSchema);
