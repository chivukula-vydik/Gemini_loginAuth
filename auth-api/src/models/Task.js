import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  estimatedHours: { type: Number, default: 0 },
  requiredSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['todo', 'in_progress', 'blocked', 'done'], default: 'todo' },
  percentComplete: { type: Number, default: 0, min: 0, max: 100 },
  proposedHours: { type: Number, default: 0 },
  estimateStatus: { type: String, enum: ['none', 'proposed', 'approved', 'rejected'], default: 'none' },
  dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  dueDate: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Task = mongoose.model('Task', taskSchema);
