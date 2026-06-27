import mongoose from 'mongoose';

const SalaryComponentTemplateSchema = new mongoose.Schema({
  key:        { type: String, required: true },
  label:      { type: String, required: true },
  type:       { type: String, enum: ['earning', 'deduction'], required: true },
  calc:       { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_ctc'], required: true },
  value:      { type: Number, required: true },
  taxable:    { type: Boolean, default: true },
  proratable: { type: Boolean, default: true },
}, { _id: false });

const PayGradeSchema = new mongoose.Schema({
  code:  { type: String, required: true, unique: true },
  label: { type: String, default: '' },
  minCtc: { type: Number, default: 0 },
  maxCtc: { type: Number, default: 0 },
  defaultComponents: [SalaryComponentTemplateSchema],
}, { timestamps: true });

export const PayGrade = mongoose.model('PayGrade', PayGradeSchema);
