import mongoose from 'mongoose';

const componentSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true },
    type:   { type: String, enum: ['earning', 'deduction'], default: 'earning' },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

const salaryStructureSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ctcAnnual:     { type: Number, required: true },
  components:    { type: [componentSchema], default: [] },
  effectiveFrom: { type: String, required: true },   // "YYYY-MM-DD"
  effectiveTo:   { type: String, default: null },
  createdAt:     { type: Date, default: Date.now },
});

salaryStructureSchema.index({ user: 1, effectiveFrom: -1 });

export const SalaryStructure = mongoose.model('SalaryStructure', salaryStructureSchema);
