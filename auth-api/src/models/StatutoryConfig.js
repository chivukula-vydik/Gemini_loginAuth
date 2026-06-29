import mongoose from 'mongoose';

const SlabSchema = new mongoose.Schema({
  upTo: { type: Number, default: null },
  rate: { type: Number, required: true },
}, { _id: false });

const SurchargeSchema = new mongoose.Schema({
  threshold: { type: Number, required: true },
  rate:      { type: Number, required: true },
}, { _id: false });

const RebateSchema = new mongoose.Schema({
  maxIncome: { type: Number, required: true },
  maxRebate: { type: Number, required: true },
}, { _id: false });

const RegimeRulesSchema = new mongoose.Schema({
  slabs:              [SlabSchema],
  standardDeduction:  { type: Number, required: true },
  rebate:             { type: RebateSchema, default: null },
  surcharge:          [SurchargeSchema],
  cessRate:           { type: Number, default: 0.04 },
  allowedDeductions:  [{ type: String }],
}, { _id: false });

const PtSlabSchema = new mongoose.Schema({
  upTo:   { type: Number, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const StatutoryConfigSchema = new mongoose.Schema({
  fy:            { type: String, required: true, unique: true },
  effectiveFrom: { type: String, required: true },
  pf: {
    employeePct: { type: Number, default: 12 },
    employerPct: { type: Number, default: 12 },
    wageCeiling: { type: Number, default: 15000 },
  },
  esic: {
    employeePct:  { type: Number, default: 0.75 },
    employerPct:  { type: Number, default: 3.25 },
    grossCeiling: { type: Number, default: 21000 },
  },
  pt: [{
    state: String,
    slabs: [PtSlabSchema],
  }],
  tds: {
    old: { type: RegimeRulesSchema, default: () => ({}) },
    new: { type: RegimeRulesSchema, default: () => ({}) },
  },
}, { timestamps: true });

export const StatutoryConfig = mongoose.model('StatutoryConfig', StatutoryConfigSchema);
