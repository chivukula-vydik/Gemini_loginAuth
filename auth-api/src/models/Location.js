import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  country: { type: String, default: '' },
  state: { type: String, default: '' },
  city: { type: String, default: '' },
  address: { type: String, default: '' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Location = mongoose.model('Location', locationSchema);
