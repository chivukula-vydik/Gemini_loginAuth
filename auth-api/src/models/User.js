import mongoose from 'mongoose';

const linkSchema = new mongoose.Schema(
  { provider: String, providerUserId: String },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName: { type: String, default: '' },
  passwordHash: { type: String, default: null },
  providers: { type: [linkSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', userSchema);
