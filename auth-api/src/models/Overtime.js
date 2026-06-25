import mongoose from 'mongoose';

const overtimeSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: String, required: true },
  startTime: { type: String, required: true },
  endTime:   { type: String, required: true },
  minutes:   { type: Number, required: true },
  reason:    { type: String, enum: ['work-overload', 'deadline', 'client-request', 'maintenance', 'other'], default: 'other' },
  note:      { type: String, default: '' },
  source:    { type: String, enum: ['manual', 'timesheet'], default: 'manual' },
  status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
});

overtimeSchema.index({ userId: 1, date: 1 });
overtimeSchema.index({ status: 1, requestedAt: -1 });

export const Overtime = mongoose.model('Overtime', overtimeSchema);
