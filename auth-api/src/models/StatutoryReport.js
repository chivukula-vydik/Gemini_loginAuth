import mongoose from 'mongoose';

const StatutoryReportSchema = new mongoose.Schema({
  type:    { type: String, enum: ['ecr', 'esic', 'pt', '24q', 'form16', 'tax_summary'], required: true },
  period:  {
    month:   { type: Number, default: null },
    year:    { type: Number, default: null },
    quarter: { type: Number, default: null },
    fy:      { type: String, default: '' },
  },
  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', default: null },
  computedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  fileUrl: { type: String, default: '' },
  status:  { type: String, enum: ['computed', 'filed'], default: 'computed' },
}, { timestamps: true });

export const StatutoryReport = mongoose.model('StatutoryReport', StatutoryReportSchema);
