import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  businessUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUnit', default: null },
  departmentHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  parentDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Department = mongoose.model('Department', departmentSchema);
