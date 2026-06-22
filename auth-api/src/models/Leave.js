import mongoose from 'mongoose';

export const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

const leaveSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: LEAVE_TYPES, required: true },
  startDate: { type: String, required: true },   // "2026-06-22" — YYYY-MM-DD
  endDate:   { type: String, required: true },   // inclusive
  reason:    { type: String, default: '' },
  status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
});

leaveSchema.index({ userId: 1, startDate: 1 });
leaveSchema.index({ status: 1, requestedAt: -1 });

export const Leave = mongoose.model('Leave', leaveSchema);

// Inclusive list of YYYY-MM-DD strings from startDate to endDate.
export function enumerateDays(startDate, endDate) {
  const out = [];
  const d = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Count working days (Mon–Fri) in the range — used for a quick day count.
export function workingDays(startDate, endDate) {
  return enumerateDays(startDate, endDate).filter((s) => {
    const dow = new Date(s + 'T00:00:00').getDay();
    return dow !== 0 && dow !== 6;
  }).length;
}
