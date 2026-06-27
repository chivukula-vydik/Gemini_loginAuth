import mongoose from 'mongoose';

const StatutoryConfigSchema = new mongoose.Schema({
  effectiveFrom: { type: String, required: true },
  pf: {
    employeePct: { type: Number, default: 12 },
    employerPct: { type: Number, default: 12 },
    wageCeiling: { type: Number, default: 15000 },
  },
  esic: {
    employeePct: { type: Number, default: 0.75 },
    employerPct: { type: Number, default: 3.25 },
    grossCeiling: { type: Number, default: 21000 },
  },
  pt: [{
    state: String,
    slabs: [{
      upTo: { type: Number, required: true },
      amount: { type: Number, required: true },
    }],
  }],
  tds: {
    old: {
      slabs: [{
        upTo: { type: Number, required: true },
        rate: { type: Number, required: true },
      }],
      standardDeduction: { type: Number, default: 50000 },
    },
    new: {
      slabs: [{
        upTo: { type: Number, required: true },
        rate: { type: Number, required: true },
      }],
      standardDeduction: { type: Number, default: 75000 },
    },
  },
}, { timestamps: true });

export const StatutoryConfig = mongoose.model('StatutoryConfig', StatutoryConfigSchema);
