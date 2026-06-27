// auth-api/src/models/Payslip.js
import mongoose from 'mongoose';

const LineItemSchema = new mongoose.Schema({
  key:    { type: String, required: true },
  label:  { type: String, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const PayslipSchema = new mongoose.Schema({
  payrollRun:  { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', index: true },
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  period:      { month: Number, year: Number },
  earnings:    [LineItemSchema],
  deductions:  [LineItemSchema],
  reimbursements: [LineItemSchema],
  statutory:   {
    pf:   { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    pt:   { type: Number, default: 0 },
    tds:  { type: Number, default: 0 },
  },
  gross:           { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  netPay:          { type: Number, default: 0 },
  lopDays:         { type: Number, default: 0 },
  paidDays:        { type: Number, default: 0 },
  otHours:         { type: Number, default: 0 },
  billableHours:   { type: Number, default: 0 },
}, { timestamps: true });

PayslipSchema.index({ payrollRun: 1, user: 1 }, { unique: true });

export const Payslip = mongoose.model('Payslip', PayslipSchema);
