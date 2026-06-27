import mongoose from 'mongoose';

const DeclarationItemSchema = new mongoose.Schema({
  section:        { type: String, required: true },
  declaredAmount: { type: Number, required: true },
  proofAmount:    { type: Number, default: null },
  proofs:         [{ url: String, filename: String }],
  verifyStatus:   { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
}, { _id: false });

const InvestmentDeclarationSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  financialYear:  { type: String, required: true },
  regime:         { type: String, enum: ['old', 'new'], required: true },
  items:          [DeclarationItemSchema],
  phase:          { type: String, enum: ['declaration', 'proof', 'closed'], default: 'declaration' },
  lockedForTds:   { type: Boolean, default: false },
}, { timestamps: true });

InvestmentDeclarationSchema.index({ user: 1, financialYear: 1 }, { unique: true });

export const InvestmentDeclaration = mongoose.model('InvestmentDeclaration', InvestmentDeclarationSchema);
