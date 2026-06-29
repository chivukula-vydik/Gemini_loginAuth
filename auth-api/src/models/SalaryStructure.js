import mongoose from 'mongoose';

const SalaryComponentSchema = new mongoose.Schema({
  key:          { type: String, required: true },
  label:        { type: String, required: true },
  type:         { type: String, enum: ['earning', 'deduction'], required: true },
  calc:         { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_ctc', 'balancing'], required: true },
  value:        { type: Number, default: 0 },
  taxable:      { type: Boolean, default: true },
  proratable:   { type: Boolean, default: true },
  employerSide: { type: Boolean, default: false },
  partOfPfWage: { type: Boolean, default: false },
}, { _id: false });

const SalaryStructureSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ctcAnnual:      { type: Number, required: true },
  components:     [SalaryComponentSchema],
  effectiveFrom:  { type: String, required: true },
  effectiveTo:    { type: String, default: null },
}, { timestamps: true });

SalaryStructureSchema.index({ user: 1, effectiveFrom: -1 });

export const SalaryStructure = mongoose.model('SalaryStructure', SalaryStructureSchema);
