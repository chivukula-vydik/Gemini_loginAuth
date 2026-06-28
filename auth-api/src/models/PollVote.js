import mongoose from 'mongoose';

const pollVoteSchema = new mongoose.Schema({
  pollId:        { type: mongoose.Schema.Types.ObjectId, ref: 'FeedItem', required: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  optionIndices: [{ type: Number, required: true }],
}, { timestamps: { createdAt: true, updatedAt: false } });

pollVoteSchema.index(
  { pollId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
);

export const PollVote = mongoose.model('PollVote', pollVoteSchema);
