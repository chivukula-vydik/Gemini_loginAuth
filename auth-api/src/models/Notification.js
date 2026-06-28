import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'like', 'leave_approved', 'leave_rejected',
  'timesheet_approved', 'claim_approved', 'claim_denied', 'mention',
];

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: NOTIFICATION_TYPES, required: true },
  refItem:   { type: mongoose.Schema.Types.ObjectId, default: null },
  refModel:  { type: String, enum: ['FeedItem', 'Leave', 'ClaimRequest'], default: null },
  read:      { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
