import mongoose from 'mongoose';

const phaseSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

phaseSchema.index({ project: 1, order: 1 });

export const Phase = mongoose.model('Phase', phaseSchema);
