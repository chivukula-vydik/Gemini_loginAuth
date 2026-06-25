import mongoose from 'mongoose';

const designationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  grade: { type: String, default: '' },
  level: { type: Number, default: 0 },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Designation = mongoose.model('Designation', designationSchema);
