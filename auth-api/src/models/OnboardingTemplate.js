import mongoose from 'mongoose';

const TemplateTaskSchema = new mongoose.Schema({
  key:        { type: String, required: true },
  title:      { type: String, required: true },
  ownerRole:  { type: String, enum: ['hr', 'it', 'manager', 'finance', 'candidate', 'admin'], required: true },
  offsetDays: { type: Number, default: 0 },
  dependsOn:  [{ type: String }],
  category:   { type: String, enum: ['document', 'asset', 'access', 'training', 'admin'], default: 'admin' },
  mandatory:  { type: Boolean, default: true },
}, { _id: false });

const OnboardingTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  appliesTo: {
    employmentType: { type: String, default: '' },
    department:     { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  },
  tasks: [TemplateTaskSchema],
}, { timestamps: true });

export const OnboardingTemplate = mongoose.model('OnboardingTemplate', OnboardingTemplateSchema);
