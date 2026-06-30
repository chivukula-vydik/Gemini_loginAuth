import mongoose from 'mongoose';

const featureFlagSchema = new mongoose.Schema({
  featureKey: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  roleGrants: { type: [String], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now },
});

export const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);
