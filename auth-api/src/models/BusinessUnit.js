import mongoose from 'mongoose';

const businessUnitSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  code: { type: String, default: '', trim: true },
  headId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  email: { type: String, default: '', trim: true },
  legalEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'LegalEntity', default: null },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const BusinessUnit = mongoose.model('BusinessUnit', businessUnitSchema);
