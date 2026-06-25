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

const notesSchema = new mongoose.Schema(
  {
    mon: { type: String, default: '' },
    tue: { type: String, default: '' },
    wed: { type: String, default: '' },
    thu: { type: String, default: '' },
    fri: { type: String, default: '' },
  },
  { _id: false }
);

const billableSchema = new mongoose.Schema(
  {
    mon: { type: Boolean, default: null },
    tue: { type: Boolean, default: null },
    wed: { type: Boolean, default: null },
    thu: { type: Boolean, default: null },
    fri: { type: Boolean, default: null },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    entries: { type: entriesSchema, default: () => ({}) },
    notes: { type: notesSchema, default: () => ({}) },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    billable: { type: billableSchema, default: () => ({}) },
    hidden: { type: Boolean, default: false },
  },
  { _id: false }
);

const dayStatusEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'returned'], default: 'draft' },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  filename: { type: String, required: true },
  contentType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const timesheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: String, required: true },
  tasks: { type: [taskSchema], default: [] },
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'returned'], default: 'draft' },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
  attachments: { type: [attachmentSchema], default: [] },
  dayStatus: {
    mon: { type: dayStatusEntrySchema, default: () => ({}) },
    tue: { type: dayStatusEntrySchema, default: () => ({}) },
    wed: { type: dayStatusEntrySchema, default: () => ({}) },
    thu: { type: dayStatusEntrySchema, default: () => ({}) },
    fri: { type: dayStatusEntrySchema, default: () => ({}) },
  },
});

timesheetSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const Timesheet = mongoose.model('Timesheet', timesheetSchema);
