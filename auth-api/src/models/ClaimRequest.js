import mongoose from 'mongoose';

const claimRequestSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

claimRequestSchema.index({ taskId: 1, status: 1 });
claimRequestSchema.index({ userId: 1 });

export const ClaimRequest = mongoose.model('ClaimRequest', claimRequestSchema);
