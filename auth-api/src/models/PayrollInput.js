import mongoose from 'mongoose';

const PayrollInputSchema = new mongoose.Schema({
  payrollRun:   { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true, index: true },
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  period:       { month: Number, year: Number },

  payableDays:    { type: Number, required: true },
  presentDays:    { type: Number, required: true },
  paidLeaveDays:  { type: Number, default: 0 },
  lopDays:        { type: Number, default: 0 },
  otHours:        { type: Number, default: 0 },
  billableHours:  { type: Number, default: 0 },

  frozen:      { type: Boolean, default: false },
  computedAt:  { type: Date, default: Date.now },
}, { timestamps: true });

PayrollInputSchema.index({ payrollRun: 1, user: 1 }, { unique: true });

export const PayrollInput = mongoose.model('PayrollInput', PayrollInputSchema);
