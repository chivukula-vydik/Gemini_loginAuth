import mongoose from 'mongoose';

export const FEED_TYPES = ['post', 'poll', 'praise', 'announcement'];
export const PRAISE_CATEGORIES = ['teamwork', 'innovation', 'leadership', 'ownership', 'excellence'];

const commentSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body:      { type: String, required: true },
  status:    { type: String, enum: ['active', 'hidden'], default: 'active' },
}, { timestamps: { createdAt: true, updatedAt: false } });

const feedItemSchema = new mongoose.Schema({
  type:           { type: String, enum: FEED_TYPES, required: true },
  author:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body:           { type: String, required: true },
  status:         { type: String, enum: ['active', 'hidden'], default: 'active' },

  pollOptions:     [{ text: { type: String, required: true } }],
  pollMultiChoice: { type: Boolean, default: false },
  pollAnonymous:   { type: Boolean, default: false },
  pollVoterHashes: [String],
  pollSalt:        { type: String, default: null, select: false },

  praiseTarget:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  praiseCategory: { type: String, enum: [...PRAISE_CATEGORIES, null], default: null },

  pinnedUntil:    { type: Date, default: null },

  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
}, { timestamps: true });

feedItemSchema.index({ status: 1, createdAt: -1 });
feedItemSchema.index({ type: 1, pinnedUntil: 1 });

export const FeedItem = mongoose.model('FeedItem', feedItemSchema);
