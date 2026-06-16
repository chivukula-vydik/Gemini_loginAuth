import mongoose from 'mongoose';

const skillSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
});

skillSchema.index({ name: 1 }, { unique: true });

export const Skill = mongoose.model('Skill', skillSchema);
