import mongoose from 'mongoose';

// Annual quotas for the types that draw against a balance. Unpaid leave is
// unlimited and never tracked here.
export const DEFAULT_QUOTAS = { casual: 12, sick: 6, earned: 15 };

const counterSchema = new mongoose.Schema(
  { total: { type: Number, required: true }, used: { type: Number, default: 0 } },
  { _id: false },
);

const leaveBalanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year:   { type: Number, required: true },
  casual: { type: counterSchema, default: () => ({ total: DEFAULT_QUOTAS.casual, used: 0 }) },
  sick:   { type: counterSchema, default: () => ({ total: DEFAULT_QUOTAS.sick, used: 0 }) },
  earned: { type: counterSchema, default: () => ({ total: DEFAULT_QUOTAS.earned, used: 0 }) },
});

leaveBalanceSchema.index({ userId: 1, year: 1 }, { unique: true });

export const LeaveBalance = mongoose.model('LeaveBalance', leaveBalanceSchema);

// Quota-tracked types only — 'unpaid' is intentionally excluded.
export const QUOTA_LEAVE_TYPES = ['casual', 'sick', 'earned'];

export async function getOrCreateBalance(userId, year) {
  let balance = await LeaveBalance.findOne({ userId, year });
  if (!balance) {
    balance = await LeaveBalance.create({ userId, year });
  }
  return balance;
}

export function remaining(balance, type) {
  const counter = balance[type];
  return counter.total - counter.used;
}
