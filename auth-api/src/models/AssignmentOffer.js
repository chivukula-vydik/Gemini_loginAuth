import mongoose from 'mongoose';

const assignmentOfferSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  offeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

assignmentOfferSchema.index({ userId: 1, status: 1 });
assignmentOfferSchema.index({ taskId: 1, status: 1 });

export const AssignmentOffer = mongoose.model('AssignmentOffer', assignmentOfferSchema);
