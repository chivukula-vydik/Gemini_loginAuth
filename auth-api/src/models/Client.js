import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  contactName: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
});

export const Client = mongoose.model('Client', clientSchema);
