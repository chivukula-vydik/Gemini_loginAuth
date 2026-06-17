import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  estimatedHours: { type: Number, default: 0 },
  estimateValue: { type: Number, default: 0 },
  estimateUnit: { type: String, enum: ['hours', 'days', 'weeks'], default: 'hours' },
  startDate: { type: Date, default: null },
  requiredSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  assignees: {
    type: [new mongoose.Schema(
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        sharePct: { type: Number, default: 0, min: 0, max: 100 },
      },
      { _id: false },
    )],
    default: [],
  },
  status: { type: String, enum: ['todo', 'in_progress', 'blocked', 'done'], default: 'todo' },
  percentComplete: { type: Number, default: 0, min: 0, max: 100 },
  proposedHours: { type: Number, default: 0 },
  proposedValue: { type: Number, default: 0 },
  proposedUnit: { type: String, enum: ['hours', 'days', 'weeks'], default: 'hours' },
  estimateStatus: { type: String, enum: ['none', 'proposed', 'approved', 'rejected'], default: 'none' },
  dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  dueDate: { type: Date, default: null },
  dueProposalValue: { type: Number, default: 0 },
  dueProposalUnit: { type: String, enum: ['hours', 'days', 'weeks'], default: 'days' },
  dueProposalAt: { type: Date, default: null },
  dueProposalStatus: { type: String, enum: ['none', 'proposed', 'approved', 'rejected'], default: 'none' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Task = mongoose.model('Task', taskSchema);
