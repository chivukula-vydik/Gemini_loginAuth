import mongoose from 'mongoose';

const editRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: String, required: true },
  day: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  reason: { type: String, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

editRequestSchema.index({ userId: 1, weekStart: 1, day: 1 });

export const EditRequest = mongoose.model('EditRequest', editRequestSchema);
