import mongoose from 'mongoose';

export const INBOX_TYPES = ['birthday_wish', 'praise', 'comment'];

const inboxMessageSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: INBOX_TYPES, required: true },
  body:      { type: String, required: true },
  refItem:   { type: mongoose.Schema.Types.ObjectId, ref: 'FeedItem', default: null },
  read:      { type: Boolean, default: false },
}, { timestamps: true });

inboxMessageSchema.index({ recipient: 1, createdAt: -1 });
inboxMessageSchema.index({ recipient: 1, read: 1 });

export const InboxMessage = mongoose.model('InboxMessage', inboxMessageSchema);
