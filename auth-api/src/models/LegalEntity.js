import mongoose from 'mongoose';

const legalEntitySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  legalName: { type: String, required: true, trim: true },
  registrationNo: { type: String, default: '', trim: true },
  gstNumber: { type: String, default: '', trim: true },
  panNumber: { type: String, default: '', trim: true },
  country: { type: String, required: true, default: 'India' },
  currency: { type: String, required: true, default: 'INR' },
  address: { type: String, default: '' },
  dateOfIncorporation: { type: Date, default: null },
  authorizedSignatory: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const LegalEntity = mongoose.model('LegalEntity', legalEntitySchema);
