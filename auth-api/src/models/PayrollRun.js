// auth-api/src/models/PayrollRun.js
import mongoose from 'mongoose';

const PayrollRunSchema = new mongoose.Schema({
  period:   { month: { type: Number, required: true }, year: { type: Number, required: true } },
  payGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'PayGroup', required: true },
  status:   { type: String, enum: ['DRAFT', 'REVIEW', 'LOCKED', 'PAID'], default: 'DRAFT' },
  runType:  { type: String, enum: ['regular', 'off_cycle', 'bonus', 'arrear', 'final_settlement'], default: 'regular' },
  scope:    { type: String, enum: ['group', 'adhoc'], default: 'group' },
  adhocMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lockedAt: { type: Date, default: null },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  totals:   {
    gross:      { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPay:     { type: Number, default: 0 },
    headcount:  { type: Number, default: 0 },
  },
}, { timestamps: true });

PayrollRunSchema.index({ 'period.year': 1, 'period.month': 1, payGroup: 1 });

export const PayrollRun = mongoose.model('PayrollRun', PayrollRunSchema);
