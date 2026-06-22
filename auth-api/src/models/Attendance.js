import mongoose from 'mongoose';

const breakSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end:   { type: Date, default: null },
  },
  { _id: false }
);

const regulariseSchema = new mongoose.Schema(
  {
    status:            { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    reason:            { type: String, default: '' },
    correctedCheckIn:  { type: String, default: null },   // "09:05" — time string, not Date
    correctedCheckOut: { type: String, default: null },   // "18:10"
    requestedAt:       { type: Date, default: null },
    decidedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt:         { type: Date, default: null },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:             { type: String, required: true },     // "2026-06-22" — YYYY-MM-DD string, not Date (avoids timezone hell)
  checkIn:          { type: Date, default: null },
  checkOut:         { type: Date, default: null },
  totalMinutes:     { type: Number, default: 0 },         // checkOut - checkIn in minutes
  breakMinutes:     { type: Number, default: 0 },         // sum of all break durations
  effectiveMinutes: { type: Number, default: 0 },         // totalMinutes - breakMinutes
  status:           {
    type: String,
    enum: ['present', 'partial', 'absent', 'wfh', 'wfh-partial', 'leave', 'holiday', 'weekend'],
    default: 'absent',
  },
  punchType:        { type: String, enum: ['office', 'remote', 'wfh'], default: 'office' },
  breaks:           { type: [breakSchema], default: [] },
  note:             { type: String, default: '' },
  regularise:       { type: regulariseSchema, default: () => ({ status: 'none' }) },
});

// One doc per person per day — enforced at DB level
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema);

export function deriveStatus(doc) {
  if (!doc.checkIn) return 'absent';

  const isWfh = doc.punchType === 'wfh';

  if (!doc.checkOut) {
    return isWfh ? 'wfh-partial' : 'partial'; // still in, no checkout yet
  }

  if (doc.effectiveMinutes >= 480) {
    return isWfh ? 'wfh' : 'present';         // 8h+ full day
  }
  if (doc.effectiveMinutes >= 240) {
    return isWfh ? 'wfh-partial' : 'partial';  // 4h+ half day
  }
  return isWfh ? 'wfh-partial' : 'partial';    // < 4h but checked in
}

export function calcMinutes(doc) {
  if (!doc.checkIn || !doc.checkOut) return { totalMinutes: 0, breakMinutes: doc.breakMinutes, effectiveMinutes: 0 };

  const totalMinutes = Math.round((doc.checkOut - doc.checkIn) / 60000);
  const effectiveMinutes = Math.max(0, totalMinutes - doc.breakMinutes);
  return { totalMinutes, breakMinutes: doc.breakMinutes, effectiveMinutes };
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const SHIFT_START_HOUR = 9;
export const SHIFT_START_MINUTE = 30;   // 9:30 AM — hardcoded for now, configurable later
export const SHIFT_END_HOUR = 18;
export const SHIFT_END_MINUTE = 30;     // 6:30 PM
export const SHIFT_DURATION_MINUTES = 540; // 9 hours
