import mongoose from 'mongoose';

const DOC_TYPES = [
  'pan', 'aadhaar', 'bank_proof', 'photo', 'education',
  'prev_payslip', 'relieving_letter', 'experience_letter', 'address_proof',
];

const DocumentRequestSchema = new mongoose.Schema({
  onboardingCase: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingCase', required: true, index: true },
  docType: { type: String, enum: DOC_TYPES, required: true },
  mandatory: { type: Boolean, default: true },
  submission: {
    fileId:      { type: mongoose.Schema.Types.ObjectId, default: null },
    filename:    { type: String, default: '' },
    contentType: { type: String, default: '' },
    size:        { type: Number, default: 0 },
    uploadedAt:  { type: Date, default: null },
    extractedFields: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  verifyStatus: {
    type: String,
    enum: ['awaiting', 'submitted', 'verified', 'rejected'],
    default: 'awaiting',
    index: true,
  },
  verifiedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt:      { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
}, { timestamps: true });

export const DocumentRequest = mongoose.model('DocumentRequest', DocumentRequestSchema);
