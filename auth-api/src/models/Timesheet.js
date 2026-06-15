import mongoose from 'mongoose';

const entriesSchema = new mongoose.Schema(
  {
    mon: { type: Number, default: 0 },
    tue: { type: Number, default: 0 },
    wed: { type: Number, default: 0 },
    thu: { type: Number, default: 0 },
    fri: { type: Number, default: 0 },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    entries: { type: entriesSchema, default: () => ({}) },
  },
  { _id: false }
);

const timesheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: String, required: true }, // 'YYYY-MM-DD', a Monday
  tasks: { type: [taskSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

timesheetSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const Timesheet = mongoose.model('Timesheet', timesheetSchema);
