import mongoose from 'mongoose';

const TemplateTaskSchema = new mongoose.Schema({
  key:        { type: String, required: true },
  title:      { type: String, required: true },
  description: { type: String, default: '' },
  ownerRole:  { type: String, enum: ['hr', 'it', 'manager', 'finance', 'candidate', 'admin'], required: true },
  taskType: {
    type: String,
    enum: ['upload', 'acknowledge', 'meeting', 'form', 'manual'],
    default: 'manual',
  },
  phase: {
    type: String,
    enum: ['pre_boarding', 'first_day', 'first_week', 'first_month'],
    default: 'first_day',
  },
  runsOn: {
    type: String,
    enum: ['candidate', 'employee'],
    default: 'employee',
  },
  offsetDays: { type: Number, default: 0 },
  dependsOn:  [{ type: String }],
  category:   { type: String, enum: ['document', 'asset', 'access', 'training', 'admin'], default: 'admin' },
  mandatory:  { type: Boolean, default: true },
}, { _id: false });

const OnboardingTemplateSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  icon:        { type: String, default: 'clipboard' },
  appliesTo: {
    employmentType: { type: String, default: '' },
    department:     { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  },
  tasks: [TemplateTaskSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  usageCount: { type: Number, default: 0 },
  archived:   { type: Boolean, default: false },
}, { timestamps: true });

export const OnboardingTemplate = mongoose.model('OnboardingTemplate', OnboardingTemplateSchema);
