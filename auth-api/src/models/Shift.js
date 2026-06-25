import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  startHour: { type: Number, required: true, min: 0, max: 23 },
  startMinute: { type: Number, default: 0, min: 0, max: 59 },
  endHour: { type: Number, required: true, min: 0, max: 23 },
  endMinute: { type: Number, default: 0, min: 0, max: 59 },
  isDefault: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Shift = mongoose.model('Shift', shiftSchema);
