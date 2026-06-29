import mongoose from 'mongoose';

const ProofSchema = new mongoose.Schema({
  fileId:      { type: mongoose.Schema.Types.ObjectId, required: true },
  filename:    { type: String, required: true },
  contentType: { type: String, default: '' },
  size:        { type: Number, default: 0 },
  uploadedAt:  { type: Date, default: Date.now },
}, { _id: false });

const DeclarationItemSchema = new mongoose.Schema({
  section:        { type: String, required: true },
  declaredAmount: { type: Number, required: true },
  proofAmount:    { type: Number, default: null },
  proofs:         [ProofSchema],
  verifyStatus:   { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  rejectReason:   { type: String, default: '' },
}, { _id: false });

const HraDetailSchema = new mongoose.Schema({
  monthlyRent:  { type: Number, default: 0 },
  isMetro:      { type: Boolean, default: false },
  landlordPan:  { type: String, default: '' },
}, { _id: false });

const InvestmentDeclarationSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  financialYear:  { type: String, required: true },
  regime:         { type: String, enum: ['old', 'new'], required: true },
  items:          [DeclarationItemSchema],
  hraDetail:      { type: HraDetailSchema, default: null },
  phase:          { type: String, enum: ['declaration', 'proof', 'closed'], default: 'declaration' },
  lockedForTds:   { type: Boolean, default: false },
}, { timestamps: true });

InvestmentDeclarationSchema.index({ user: 1, financialYear: 1 }, { unique: true });

export const InvestmentDeclaration = mongoose.model('InvestmentDeclaration', InvestmentDeclarationSchema);
