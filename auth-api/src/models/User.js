import mongoose from 'mongoose';

const linkSchema = new mongoose.Schema(
  { provider: String, providerUserId: String },
  { _id: false }
);

// One re-estimation request, kept permanently against the user (Part 4). Written
// pending when the assignee asks; stamped approved/rejected when a PM decides.
const reestimationSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    taskTitle: { type: String, default: '' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String, default: '' },
    fromHours: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
    unit: { type: String, enum: ['hours', 'days', 'weeks'], default: 'hours' },
    toHours: { type: Number, default: 0 },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName: { type: String, default: '' },
  passwordHash: { type: String, default: null },
  providers: { type: [linkSchema], default: [] },
  roles: { type: [String], enum: ['admin', 'pm', 'employee', 'reporting_manager'], default: ['employee'] },
  active: { type: Boolean, default: true },
  skills: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }], default: [] },
  reestimations: { type: [reestimationSchema], default: [] },
  reestimationCount: { type: Number, default: 0 },
  weeklyTargetMinutes: { type: Number, default: null },
  // Day the attendance feature went live for this user ("YYYY-MM-DD"), stamped on
  // first clock-in. Days before this are never flagged as missed/absent.
  attendanceActivatedDate: { type: String, default: null },
  reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', userSchema);
