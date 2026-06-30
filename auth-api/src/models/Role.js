import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, lowercase: true },
  label: { type: String, required: true, trim: true },
  builtIn: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Role = mongoose.model('Role', roleSchema);

const BUILT_IN = [
  { name: 'admin', label: 'Admin' },
  { name: 'pm', label: 'PM' },
  { name: 'employee', label: 'Employee' },
  { name: 'reporting_manager', label: 'Reporting Manager' },
  { name: 'hr', label: 'HR' },
  { name: 'finance', label: 'Finance' },
  { name: 'team_lead', label: 'Team Lead' },
  { name: 'director', label: 'Director' },
  { name: 'vp', label: 'VP' },
];

export async function ensureBuiltInRoles() {
  for (const r of BUILT_IN) {
    await Role.updateOne({ name: r.name }, { $setOnInsert: { ...r, builtIn: true } }, { upsert: true });
  }
}
