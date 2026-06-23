import mongoose from 'mongoose';

const urlActivitySchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url:        { type: String, required: true, trim: true },
  title:      { type: String, default: '' },
  category:   { type: String, enum: ['productive', 'neutral', 'non-productive'], default: 'neutral' },
  startedAt:  { type: Date, required: true },
  endedAt:    { type: Date, default: null },
  durationMs: { type: Number, default: 0 },
  source:     { type: String, default: 'api' },
});

urlActivitySchema.index({ userId: 1, startedAt: -1 });
urlActivitySchema.index({ category: 1 });

export const UrlActivity = mongoose.model('UrlActivity', urlActivitySchema);
