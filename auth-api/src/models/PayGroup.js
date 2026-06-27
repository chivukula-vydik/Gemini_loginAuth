import mongoose from 'mongoose';

const payGroupSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  members:     { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  createdAt:   { type: Date, default: Date.now },
});

export const PayGroup = mongoose.model('PayGroup', payGroupSchema);
