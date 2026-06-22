import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true },   // "2026-01-01" — YYYY-MM-DD
  name: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
});

holidaySchema.index({ date: 1 }, { unique: true });

export const Holiday = mongoose.model('Holiday', holidaySchema);
