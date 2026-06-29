import mongoose from 'mongoose';

const OnboardingTaskSchema = new mongoose.Schema({
  onboardingCase: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingCase', required: true, index: true },
  templateKey:    { type: String, default: '' },
  title:          { type: String, required: true },
  ownerRole:      { type: String, default: '' },
  taskType: {
    type: String,
    enum: ['upload', 'acknowledge', 'meeting', 'form', 'manual'],
    default: 'manual',
  },
  phase: {
    type: String,
    enum: ['pre_boarding', 'first_day', 'first_week', 'first_month', 'general'],
    default: 'general',
  },
  runsOn: {
    type: String,
    enum: ['candidate', 'employee'],
    default: 'employee',
  },
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dueDate:        { type: Date, default: null },
  dependsOn:      [{ type: String }],
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'done', 'skipped'],
    default: 'pending',
    index: true,
  },
  mandatory:    { type: Boolean, default: true },
  completedAt:  { type: Date, default: null },
  completedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export const OnboardingTask = mongoose.model('OnboardingTask', OnboardingTaskSchema);
