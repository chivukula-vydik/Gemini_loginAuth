import mongoose from 'mongoose';

const PayGroupSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  entity:    { type: mongoose.Schema.Types.ObjectId, ref: 'LegalEntity', default: null },
  cycle:     { type: String, enum: ['calendar'], default: 'calendar' },
  ptState:   { type: String, default: '' },
  members:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

export const PayGroup = mongoose.model('PayGroup', PayGroupSchema);
