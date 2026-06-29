import mongoose from 'mongoose';

const SalaryComponentSchema = new mongoose.Schema({
  key:          { type: String, required: true },
  label:        { type: String, required: true },
  type:         { type: String, enum: ['earning', 'deduction'], required: true },
  calc:         { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_ctc', 'balancing'], required: true },
  value:        { type: Number, default: 0 },
  taxable:      { type: Boolean, default: true },
  proratable:   { type: Boolean, default: true },
  employerSide: { type: Boolean, default: false },
  partOfPfWage: { type: Boolean, default: false },
}, { _id: false });

const OfferSchema = new mongoose.Schema({
  onboardingCase: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingCase', required: true, index: true },
  version:        { type: Number, default: 1 },
  ctcAnnual:      { type: Number, default: 0 },
  componentsPreview: [SalaryComponentSchema],
  joiningDate:    { type: Date, default: null },
  expiryDate:     { type: Date, default: null },
  letterUrl:      { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'declined', 'expired', 'revised'],
    default: 'draft',
  },
  sentAt:       { type: Date, default: null },
  respondedAt:  { type: Date, default: null },
  candidateSignature: {
    signedAt: { type: Date, default: null },
    ip:       { type: String, default: '' },
  },
  declineReason: { type: String, default: '' },
}, { timestamps: true });

export const Offer = mongoose.model('Offer', OfferSchema);
